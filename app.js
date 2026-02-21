// Vendetti PVR Viewer — app.js (Enterprise Upload Version)
// 1. Gets Signed URL from Google Apps Script
// 2. Uploads directly to GCS
// 3. Notifies Make.com to start processing

// CONFIGURATION
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzMQwQ6gX_24qZ0Dk4MvcxtiLgooPc2r-Nr2EC3ZlU1iTC1Ck05b9GRuTqpiIeGgPLc/exec";
const MAKE_WEBHOOK_URL = "https://hook.us2.make.com/nnsatp6r5c33pgurffkk4ny8w6x4jpm7"; // Your "Processor" Webhook

// ---- DOM refs ----
const fileInput = document.getElementById("fileInput");
const fileList = document.getElementById("fileList");
const additionalFields = document.getElementById("additionalFields");
const uploadZone = document.getElementById("uploadZone");
const submitBtn = document.getElementById("submitBtn");
const statusMessage = document.getElementById("statusMessage");

// Optional fields
const projectHintEl = document.querySelector('input[name="project_hint"]');
const clientNameEl = document.querySelector('input[name="client_name"]');

// ---- UI Helpers ----
(function initReveal() {
  const els = document.querySelectorAll(".reveal");
  if (!els || els.length === 0) return;
  const obs = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) e.target.classList.add("is-visible");
    });
  }, { threshold: 0.08 });
  els.forEach((el) => obs.observe(el));
})();

if (uploadZone && fileInput) {
  uploadZone.addEventListener("click", () => fileInput.click());
  uploadZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    uploadZone.classList.add("dragover");
  });
  uploadZone.addEventListener("dragleave", () => uploadZone.classList.remove("dragover"));
  uploadZone.addEventListener("drop", (e) => {
    e.preventDefault();
    uploadZone.classList.remove("dragover");
    if (e.dataTransfer.files.length) {
      fileInput.files = e.dataTransfer.files;
      updateFileList();
    }
  });
  fileInput.addEventListener("change", updateFileList);
}

function updateFileList() {
  if (!fileList || !fileInput.files.length) {
    if (fileList) fileList.innerHTML = "";
    if (additionalFields) additionalFields.style.display = "none";
    return;
  }
  const file = fileInput.files[0];
  fileList.innerHTML = `
    <div class="file-item">
      <span class="file-name">${escapeHtml(file.name)}</span>
      <span class="file-size">${(file.size / 1024 / 1024).toFixed(2)} MB</span>
    </div>`;
  if (additionalFields) additionalFields.style.display = "block";
}

// ---- SUBMISSION LOGIC ----
const form = document.getElementById("uploadForm");
if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!fileInput.files.length) {
      alert("Please select a file first.");
      return;
    }

    const file = fileInput.files[0];
    submitBtn.disabled = true;
    submitBtn.textContent = "Step 1/3: Getting Secure Link...";
    statusMessage.textContent = "";
    statusMessage.style.color = "#333";

    try {
      // 1. GET SIGNED URL (The "VIP Pass")
      const authResponse = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors', // Apps Script quirk
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name }) 
      });

      // Note: 'no-cors' mode means we can't read the response directly in standard fetch.
      // FIX: We must use the redirect method or standard POST.
      // Let's retry with standard POST expecting the script handles CORS correctly (we set "Anyone" access).
      
      const ticketResponse = await fetch(APPS_SCRIPT_URL, {
         method: "POST",
         body: JSON.stringify({ filename: file.name })
      });
      
      if (!ticketResponse.ok) throw new Error("Failed to get upload ticket from Google.");
      const ticketData = await ticketResponse.json();
      
      if (!ticketData.signedUrl) throw new Error("No signed URL returned: " + JSON.stringify(ticketData));

      // 2. UPLOAD TO GOOGLE CLOUD (The "Heavy Lifting")
      submitBtn.textContent = "Step 2/3: Uploading to Cloud...";
      
      const uploadResponse = await fetch(ticketData.signedUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/pdf" },
        body: file
      });

      if (!uploadResponse.ok) throw new Error("Cloud upload failed: " + uploadResponse.statusText);

      // 3. NOTIFY MAKE.COM (The "Start Button")
      submitBtn.textContent = "Step 3/3: Starting Analysis...";
      
      const payload = {
        filename: file.name,
        client_name: clientNameEl ? clientNameEl.value : "",
        project_hint: projectHintEl ? projectHintEl.value : ""
      };

      const triggerResponse = await fetch(MAKE_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!triggerResponse.ok) throw new Error("Analysis failed to start.");

      // SUCCESS
      statusMessage.style.color = "#28a745";
      statusMessage.textContent = "✓ Report uploaded & analysis started successfully!";
      
      // Reset
      form.reset();
      updateFileList();

    } catch (err) {
      console.error(err);
      statusMessage.style.color = "#dc3545";
      statusMessage.textContent = "✗ Error: " + err.message;
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit Report for Analysis";
    }
  });
}

function escapeHtml(text) {
  if (!text) return "";
  return text.replace(/[&<>"']/g, function(m) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m];
  });
}
