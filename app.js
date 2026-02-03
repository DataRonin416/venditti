// Vendetti PVR Viewer — app.js (updated for Make.com + multipart upload)
// Key updates:
// - Uses FormData (multipart) to avoid 413 "Content Too Large" from base64 JSON
// - Removes base64 conversion entirely
// - Fixes clientNameInput/projectHintInput reference errors
// - Adds stronger response/error handling + clearer status messages

// Hard-coded Make webhook (updated)
const MAKE_WEBHOOK_URL = "https://hook.us2.make.com/lnpabxklvc4l17jda54dgh8x6x1gh7q5";

// ---- DOM refs ----
const fileInput = document.getElementById("fileInput");
const fileList = document.getElementById("fileList");
const additionalFields = document.getElementById("additionalFields");
const uploadZone = document.getElementById("uploadZone");
const submitBtn = document.getElementById("submitBtn");
const statusMessage = document.getElementById("statusMessage");

// Optional fields (safe even if absent)
const projectHintEl = document.querySelector('input[name="project_hint"]');
const clientNameEl = document.querySelector('input[name="client_name"]');

// ---- Small UI helper: reveal-on-scroll ----
(function initReveal() {
  const els = document.querySelectorAll(".reveal");
  if (!els || els.length === 0) return;

  const obs = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) e.target.classList.add("is-visible");
      });
    },
    { threshold: 0.08 }
  );

  els.forEach((el) => obs.observe(el));
})();

// ---- Upload zone click/keyboard ----
if (uploadZone && fileInput) {
  uploadZone.addEventListener("click", (e) => {
    if (e.target !== fileInput) fileInput.click();
  });

  uploadZone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") fileInput.click();
  });

  // Drag & drop handlers
  ["dragenter", "dragover", "dragleave", "drop"].forEach((ev) => {
    uploadZone.addEventListener(ev, preventDefaults, false);
    document.body.addEventListener(ev, preventDefaults, false);
  });

  ["dragenter", "dragover"].forEach((ev) => {
    uploadZone.addEventListener(
      ev,
      () => uploadZone.classList.add("dragover"),
      false
    );
  });

  ["dragleave", "drop"].forEach((ev) => {
    uploadZone.addEventListener(
      ev,
      () => uploadZone.classList.remove("dragover"),
      false
    );
  });

  uploadZone.addEventListener(
    "drop",
    (e) => {
      const dt = e.dataTransfer;
      const files = dt?.files;
      if (!files || files.length === 0) return;

      // Put dropped file into the file input
      const dataTransfer = new DataTransfer();
      for (let i = 0; i < files.length; i++) dataTransfer.items.add(files[i]);
      fileInput.files = dataTransfer.files;

      handleFiles(files);
    },
    false
  );
}

function preventDefaults(e) {
  e.preventDefault();
  e.stopPropagation();
}

// ---- File input change ----
if (fileInput) {
  fileInput.addEventListener("change", (e) => handleFiles(e.target.files));
}

function handleFiles(files) {
  if (fileList) fileList.innerHTML = "";
  if (!files || files.length === 0) return;

  const file = files[0];
  const isPdf =
    file.type === "application/pdf" ||
    file.name.toLowerCase().endsWith(".pdf");

  if (!isPdf) {
    alert("Please upload only PDF files.");
    if (fileInput) fileInput.value = "";
    if (additionalFields) additionalFields.style.display = "none";
    if (statusMessage) statusMessage.textContent = "";
    return;
  }

  // Render selected file UI
  const item = document.createElement("div");
  item.className = "file-item";

  const left = document.createElement("div");
  left.innerHTML = `
    <div class="file-name">📄 ${escapeHtml(file.name)}</div>
    <div class="file-size">${formatFileSize(file.size)}</div>
  `;

  const right = document.createElement("div");
  right.style.color = "#28a745";
  right.style.fontWeight = "bold";
  right.textContent = "File selected ✓";

  item.appendChild(left);
  item.appendChild(right);

  if (fileList) fileList.appendChild(item);

  if (additionalFields) additionalFields.style.display = "block";
  if (statusMessage) statusMessage.textContent = "";
}

function formatFileSize(bytes) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}

// ---- Submit handler: multipart upload to Make.com ----
if (submitBtn) {
  submitBtn.addEventListener("click", async () => {
    console.log("Submitting to webhook:", MAKE_WEBHOOK_URL);

    if (!fileInput?.files || fileInput.files.length === 0) {
      alert("Please select a PDF file before submitting.");
      return;
    }

    const file = fileInput.files[0];
    const isPdf =
      file.type === "application/pdf" ||
      file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      alert("Please upload only PDF files.");
      return;
    }

    // Read optional metadata (safe even if inputs missing)
    const projectHint = projectHintEl?.value ? String(projectHintEl.value) : "";
    const clientName = clientNameEl?.value ? String(clientNameEl.value) : "";

    // UI state
    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting...";
    if (statusMessage) {
      statusMessage.style.color = "#667eea";
      statusMessage.textContent = "Uploading your report to Make.com...";
    }

    try {
      // Build multipart form-data (avoids base64 size limit)
      const fd = new FormData();
      fd.append("report_file", file); // binary file
      fd.append("filename", file.name);
      fd.append("client_name", clientName);
      fd.append("project_hint", projectHint);
      fd.append("source", "vendetti-web-uploader");
      fd.append("sent_at_iso", new Date().toISOString());

      const response = await fetch(MAKE_WEBHOOK_URL, {
        method: "POST",
        body: fd,
      });

      if (!response.ok) {
        // Try to capture response body for debugging
        const txt = await response.text().catch(() => "");
        throw new Error(
          `Make.com webhook error ${response.status}${
            txt ? `: ${txt}` : ""
          }`
        );
      }

      // Attempt to read JSON response (your Make “Webhook response” returns JSON)
      let ack = null;
      try {
        ack = await response.json();
      } catch {
        // Some webhooks may respond empty; that's fine if status was OK
      }

      if (statusMessage) {
        statusMessage.style.color = "#28a745";
        statusMessage.textContent = ack?.job_id
          ? `✓ Submitted successfully. Job ID: ${ack.job_id}`
          : "✓ Submitted successfully.";
      }

      // Reset form UI
      const form = document.getElementById("uploadForm");
      if (form) form.reset();
      if (fileList) fileList.innerHTML = "";
      if (additionalFields) additionalFields.style.display = "none";
    } catch (err) {
      console.error(err);
      if (statusMessage) {
        statusMessage.style.color = "#dc3545";
        statusMessage.textContent = `✗ Submit failed: ${
          err?.message || String(err)
        }`;
      }
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit Report for Analysis";
    }
  });
}

function escapeHtml(x) {
  return String(x)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
