// Hard-coded Make webhook (updated)
const MAKE_WEBHOOK_URL = "https://hook.us2.make.com/lnpabxklvc4l17jda54dgh8x6x1gh7q5";

const fileInput = document.getElementById('fileInput');
const fileList = document.getElementById('fileList');
const additionalFields = document.getElementById('additionalFields');
const uploadZone = document.getElementById('uploadZone');
const submitBtn = document.getElementById('submitBtn');
const statusMessage = document.getElementById('statusMessage');

(function initReveal(){
  const els = document.querySelectorAll('.reveal');
  const obs = new IntersectionObserver((entries)=>{
    entries.forEach(e=>{
      if(e.isIntersecting) e.target.classList.add('is-visible');
    });
  }, { threshold: 0.08 });
  els.forEach(el=>obs.observe(el));
})();

uploadZone.addEventListener('click', (e)=>{ if(e.target !== fileInput) fileInput.click(); });
uploadZone.addEventListener('keydown', (e)=>{ if(e.key === 'Enter' || e.key === ' ') fileInput.click(); });

['dragenter','dragover','dragleave','drop'].forEach(ev=>{
  uploadZone.addEventListener(ev, preventDefaults, false);
  document.body.addEventListener(ev, preventDefaults, false);
});
function preventDefaults(e){ e.preventDefault(); e.stopPropagation(); }

['dragenter','dragover'].forEach(ev=>{
  uploadZone.addEventListener(ev, ()=>uploadZone.classList.add('dragover'), false);
});
['dragleave','drop'].forEach(ev=>{
  uploadZone.addEventListener(ev, ()=>uploadZone.classList.remove('dragover'), false);
});

uploadZone.addEventListener('drop', (e)=>{
  const dt = e.dataTransfer;
  const files = dt.files;
  const dataTransfer = new DataTransfer();
  for (let i=0;i<files.length;i++) dataTransfer.items.add(files[i]);
  fileInput.files = dataTransfer.files;
  handleFiles(files);
}, false);

fileInput.addEventListener('change', (e)=>handleFiles(e.target.files));

function handleFiles(files){
  fileList.innerHTML = '';
  if(!files || files.length === 0) return;

  const file = files[0];
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

  if(!isPdf){
    alert('Please upload only PDF files');
    fileInput.value = '';
    additionalFields.style.display = 'none';
    return;
  }

  const item = document.createElement('div');
  item.className = 'file-item';

  const left = document.createElement('div');
  left.innerHTML = `
    <div class="file-name">📄 ${escapeHtml(file.name)}</div>
    <div class="file-size">${formatFileSize(file.size)}</div>
  `;

  const right = document.createElement('div');
  right.style.color = '#28a745';
  right.style.fontWeight = 'bold';
  right.textContent = 'File selected ✓';

  item.appendChild(left);
  item.appendChild(right);
  fileList.appendChild(item);

  additionalFields.style.display = 'block';
  statusMessage.textContent = '';
}

function formatFileSize(bytes){
  if(bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes','KB','MB','GB'];
  const i = Math.floor(Math.log(bytes)/Math.log(k));
  return Math.round(bytes/Math.pow(k,i)*100)/100 + ' ' + sizes[i];
}

submitBtn.addEventListener('click', async ()=>{
  if(!fileInput.files || fileInput.files.length === 0){
    alert('Please select a PDF file before submitting');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Submitting...';
  statusMessage.style.color = '#667eea';
  statusMessage.textContent = 'Preparing your report upload...';

  const file = fileInput.files[0];
  const projectHint = document.querySelector('input[name="project_hint"]').value || '';
  const clientName = document.querySelector('input[name="client_name"]').value || '';

  try{
    const base64Data = await fileToBase64(file);

    const payload = {
      report_file_base64: base64Data,
      filename: file.name,
      project_hint: projectHint,
      client_name: clientName,
      source: "vendetti-web-uploader",
      sent_at_iso: new Date().toISOString()
    };

    statusMessage.textContent = 'Sending to Make.com...';

    await fetch(MAKE_WEBHOOK_URL, {
      method:'POST',
      mode:'no-cors',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify(payload)
    });

    statusMessage.style.color = '#28a745';
    statusMessage.textContent = '✓ Submitted (request sent). Check Make.com “Run once” / execution log to confirm receipt.';

    document.getElementById('uploadForm').reset();
    fileList.innerHTML = '';
    additionalFields.style.display = 'none';

  } catch(err){
    console.error(err);
    statusMessage.style.color = '#dc3545';
    statusMessage.textContent = '✗ Submit failed locally. If this keeps happening, tell me what browser you used.';
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit Report for Analysis';
  }
});

function fileToBase64(file){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onload = (e)=>resolve(String(e.target.result).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function escapeHtml(x){
  return String(x).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
