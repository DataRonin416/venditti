(() => {
  const el = (id) => document.getElementById(id);

  const fileInput = el('fileInput');
  const textInput = el('textInput');
  const btnRender = el('btnRender');
  const btnClear = el('btnClear');
  const btnExample = el('btnExample');
  const btnDownloadJson = el('btnDownloadJson');

  const viewer = el('viewer');
  const reportView = el('reportView');
  const tablesView = el('tablesView');

  const tabReport = el('tabReport');
  const tabTables = el('tabTables');

  const errorBox = el('errorBox');
  const statusPill = el('statusPill');
  const viewerMeta = el('viewerMeta');

  let lastData = null;

  function setError(msg){
    if (!msg){
      errorBox.classList.add('hidden');
      errorBox.textContent = '';
      return;
    }
    errorBox.textContent = msg;
    errorBox.classList.remove('hidden');
  }

  function setPill(kind, text){
    statusPill.className = 'pill ' + kind;
    statusPill.textContent = text;
  }

  function safeString(x){
    if (x === null || x === undefined) return '';
    if (typeof x === 'string') return x;
    return JSON.stringify(x, null, 2);
  }

  function detectType(data){
    // Forensic: has doc_sections.tables.*_markdown or doc_sections.executive_summary
    if (data && typeof data === 'object'){
      if (data.doc_sections && (data.doc_sections.executive_summary || (data.doc_sections.tables && typeof data.doc_sections.tables === 'object'))){
        return 'forensic';
      }
      // Automation: top-level has tab objects with columns/rows OR RUN_CONTROL
      const looksTab = (obj) => obj && typeof obj === 'object' && Array.isArray(obj.columns) && Array.isArray(obj.rows);
      if (looksTab(data.RUN_CONTROL) || looksTab(data.PROJECT_INFO) || looksTab(data.MASTER_SOIL_MODIFICATION)){
        return 'automation';
      }
    }
    return 'unknown';
  }

  function formatStatus(data){
    const status = (data && data.status) ? String(data.status) : '';
    if (!status) return { kind: 'pill--neutral', text: 'Rendered' };
    const up = status.toUpperCase();
    if (up.includes('DELIVERABLE')) return { kind: 'pill--good', text: status };
    if (up.includes('NEEDS')) return { kind: 'pill--warn', text: status };
    if (up.includes('UNREADABLE')) return { kind: 'pill--bad', text: status };
    return { kind: 'pill--neutral', text: status };
  }

  function markdownTableToHTML(md){
    // Minimal parser for standard markdown tables.
    // Expects:
    // | a | b |
    // |---|---|
    // | 1 | 2 |
    const lines = md.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) return '<div class="muted small">Table not available.</div>';

    const parseRow = (line) => {
      let s = line;
      if (s.startsWith('|')) s = s.slice(1);
      if (s.endsWith('|')) s = s.slice(0, -1);
      return s.split('|').map(c => c.trim());
    };

    const header = parseRow(lines[0]);
    // find separator line index (usually 1)
    let sepIdx = 1;
    for (let i=1;i<Math.min(lines.length,4);i++){
      if (/^\|?\s*:?[-]{3,}/.test(lines[i])) { sepIdx = i; break; }
    }
    const bodyLines = lines.slice(sepIdx+1);
    const rows = bodyLines.map(parseRow);

    const esc = (t) => String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

    let html = '<div class="tableWrap"><table><thead><tr>';
    header.forEach(h => { html += '<th>' + esc(h) + '</th>'; });
    html += '</tr></thead><tbody>';
    rows.forEach(r => {
      html += '<tr>';
      for (let i=0;i<header.length;i++){
        html += '<td>' + esc(r[i] ?? '') + '</td>';
      }
      html += '</tr>';
    });
    html += '</tbody></table></div>';
    return html;
  }

  function tableFromColumnsRows(tab){
    const esc = (t) => String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    if (!tab || !Array.isArray(tab.columns) || !Array.isArray(tab.rows)) {
      return '<div class="muted small">Table not available.</div>';
    }
    const cols = tab.columns;
    const rows = tab.rows;

    let html = '<div class="tableWrap"><table><thead><tr>';
    cols.forEach(c => html += '<th>' + esc(c) + '</th>');
    html += '</tr></thead><tbody>';

    rows.forEach(rowObj => {
      html += '<tr>';
      cols.forEach(c => {
        const v = (rowObj && Object.prototype.hasOwnProperty.call(rowObj, c)) ? rowObj[c] : '';
        html += '<td>' + esc(v ?? '') + '</td>';
      });
      html += '</tr>';
    });

    html += '</tbody></table></div>';
    return html;
  }

  function renderForensic(data){
    const project = data.project_name || 'Project';
    const job = data.job_id || 'NOT STATED';
    const status = data.status || 'NOT STATED';

    const clientIssues = data.client_review?.issues_summary || '';
    const clientNext = data.client_review?.recommended_next_steps || '';

    const execSummary = data.doc_sections?.executive_summary || '';
    const narrative = data.doc_sections?.narrative_analysis || '';

    const risk = data.render_hints?.primary_risk || 'UNKNOWN';

    const metaParts = [
      `Job: ${job}`,
      `Status: ${status}`,
      `Risk: ${risk}`
    ].filter(Boolean);

    viewerMeta.textContent = metaParts.join(' • ');

    // Report view: polished sections
    let html = '';
    html += '<div class="section">';
    html += `<div class="badge">Project: ${escapeHTML(project)}</div>`;
    html += '</div>';

    html += '<div class="section">';
    html += '<h3 class="h2">Summary</h3>';
    html += `<div class="muted">${escapeHTML(execSummary || 'NOT STATED')}</div>`;
    html += '</div>';

    html += '<div class="section">';
    html += '<h3 class="h2">Client notes</h3>';
    if (clientIssues){
      html += `<div class="kv"><div class="k">Items to confirm</div><div class="v">${escapeHTML(clientIssues)}</div></div>`;
    } else {
      html += '<div class="muted">No client-facing notes provided.</div>';
    }
    html += '<hr class="sep"/>';
    if (clientNext){
      html += `<div class="kv"><div class="k">Recommended next steps</div><div class="v">${escapeHTML(clientNext)}</div></div>`;
    } else {
      html += '<div class="muted">No recommended next steps provided.</div>';
    }
    html += '</div>';

    html += '<div class="section">';
    html += '<h3 class="h2">Detailed discussion</h3>';
    html += `<div class="v">${escapeHTML(narrative || 'NOT STATED')}</div>`;
    html += '</div>';

    reportView.innerHTML = html;

    // Tables view: list tables from doc_sections.tables
    const tables = data.doc_sections?.tables || {};
    let tHtml = '';
    const keys = Object.keys(tables).sort();
    if (keys.length === 0){
      tHtml += '<div class="muted">No tables found in the JSON output.</div>';
    } else {
      // group markdown tables by *_markdown
      const mdKeys = keys.filter(k => k.endsWith('_markdown'));
      if (mdKeys.length === 0){
        tHtml += '<div class="muted">No markdown-formatted tables found.</div>';
      } else {
        mdKeys.forEach(k => {
          const title = k.replace(/_markdown$/,'').replace(/_/g,' ');
          const md = safeString(tables[k] || '');
          tHtml += `<div class="section"><h3 class="h2">${escapeHTML(title)}</h3>`;
          if (md === 'TOO_LARGE'){
            tHtml += '<div class="muted">This table was too large to display. Please refer to the overflow chunks in your workflow.</div>';
          } else {
            tHtml += markdownTableToHTML(md);
          }
          tHtml += '</div>';
        });
      }
    }
    tablesView.innerHTML = tHtml;
  }

  function renderAutomation(data){
    // Meta from RUN_CONTROL if present
    const rc = data.RUN_CONTROL?.rows?.[0] || {};
    const job = rc.job_id || data.job_id || 'NOT STATED';
    const status = rc.status || data.status || 'NOT STATED';
    const risk = data.render_hints?.primary_risk || 'UNKNOWN';

    viewerMeta.textContent = `Job: ${job} • Status: ${status} • Risk: ${risk}`;

    // Client-safe report view: use RUN_CONTROL summaries if present, otherwise provide gentle message.
    const telegram = rc.telegram_summary || '';
    const sms = rc.sms_summary || '';
    const notes = rc.notes || '';

    let html = '';
    html += '<div class="section">';
    html += `<div class="badge">Summary</div>`;
    html += '<div class="muted" style="margin-top:10px;">';
    html += escapeHTML(telegram || sms || 'This file contains structured tables. Use “Detailed tables” to view the extracted information.');
    html += '</div>';
    if (notes){
      html += `<div class="muted small" style="margin-top:10px;">${escapeHTML(notes)}</div>`;
    }
    html += '</div>';

    reportView.innerHTML = html;

    // Detailed tables: show tab list excluding OVERFLOW
    const excluded = new Set(['OVERFLOW']);
    const tabNames = Object.keys(data).filter(k => !excluded.has(k) && data[k] && data[k].columns && data[k].rows);
    tabNames.sort((a,b) => a.localeCompare(b));

    // Build tab buttons and tables
    let tHtml = '';
    if (tabNames.length === 0){
      tHtml = '<div class="muted">No tabular tables were detected in this JSON.</div>';
      tablesView.innerHTML = tHtml;
      return;
    }

    // Tabs UI (simple)
    tHtml += '<div class="section">';
    tHtml += '<div class="muted small">Choose a table:</div>';
    tHtml += '<div class="tabs" id="autoTabs"></div>';
    tHtml += '<div id="autoTabContent" style="margin-top:12px;"></div>';
    tHtml += '</div>';

    tablesView.innerHTML = tHtml;

    const tabsEl = document.getElementById('autoTabs');
    const contentEl = document.getElementById('autoTabContent');

    // Build buttons
    tabNames.forEach((name, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn--ghost';
      btn.style.margin = '6px 8px 0 0';
      btn.textContent = prettifyTabName(name);
      btn.addEventListener('click', () => showTab(name));
      tabsEl.appendChild(btn);
      if (idx === 0) showTab(name);
    });

    function showTab(name){
      const tab = data[name];
      let inner = `<h3 class="h2">${escapeHTML(prettifyTabName(name))}</h3>`;
      inner += tableFromColumnsRows(tab);

      // Overflow hint
      if (name === 'RUN_CONTROL' && data.OVERFLOW && Array.isArray(data.OVERFLOW.rows) && data.OVERFLOW.rows.length){
        inner += '<div class="muted small" style="margin-top:10px;">Some fields were too large and were split into overflow chunks.</div>';
      }
      contentEl.innerHTML = inner;
    }
  }

  function prettifyTabName(name){
    return String(name).replace(/_/g,' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  }

  function escapeHTML(s){
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function render(data){
    setError(null);
    viewer.classList.remove('hidden');

    // set pill
    const st = formatStatus(data);
    setPill(st.kind, st.text);

    const t = detectType(data);
    if (t === 'forensic'){
      renderForensic(data);
    } else if (t === 'automation'){
      renderAutomation(data);
    } else {
      reportView.innerHTML = '<div class="muted">Unknown JSON format. Please upload output from the Lite/Forensic/Automation engines.</div>';
      tablesView.innerHTML = '';
      viewerMeta.textContent = 'Unable to detect JSON type';
    }
  }

  function loadFromText(text){
    if (!text || !text.trim()){
      setError('Please upload a JSON file or paste JSON into the textbox.');
      setPill('pill--neutral', 'Waiting for input');
      viewer.classList.add('hidden');
      return;
    }
    let data;
    try{
      data = JSON.parse(text);
    } catch(e){
      setError('That does not look like valid JSON. If you copied it from a tool, make sure you copied the entire output.');
      setPill('pill--bad', 'Invalid JSON');
      viewer.classList.add('hidden');
      return;
    }
    lastData = data;
    render(data);
  }

  btnRender.addEventListener('click', () => loadFromText(textInput.value));

  btnClear.addEventListener('click', () => {
    fileInput.value = '';
    textInput.value = '';
    lastData = null;
    setError(null);
    viewer.classList.add('hidden');
    setPill('pill--neutral', 'Waiting for input');
  });

  btnExample.addEventListener('click', () => {
    const example = {
      "job_id": "EXAMPLE-001",
      "status": "DELIVERABLE_READY",
      "project_name": "Example Project",
      "render_hints": { "preferred_view": "forensic_report", "primary_risk": "MEDIUM" },
      "client_review": {
        "issues_summary": "• Some lab test details were not stated.\n• PVR method was referenced but inputs were incomplete.",
        "recommended_next_steps": "Request the swell test results and confirm active zone depth assumptions."
      },
      "doc_sections": {
        "executive_summary": "This is an example summary. Upload your JSON to view the real report.",
        "tables": {
          "PROJECT_INFO_TABLE_markdown": "| Field | Value |\n|---|---|\n Griffin | NOT STATED |",
          "PROJECT_INFO_TABLE_csv": "Field,Value\nGriffin,NOT STATED\n"
        },
        "narrative_analysis": "Example narrative text."
      }
    };
    textInput.value = JSON.stringify(example, null, 2);
    loadFromText(textInput.value);
  });

  btnDownloadJson.addEventListener('click', () => {
    if (!lastData){
      setError('Nothing to download yet. Render a JSON file first.');
      return;
    }
    const blob = new Blob([JSON.stringify(lastData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (lastData.job_id ? String(lastData.job_id) : 'report') + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  // File upload
  fileInput.addEventListener('change', async (ev) => {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    const text = await file.text();
    textInput.value = text;
    loadFromText(text);
  });

  // Tabs switching
  function setActiveTab(which){
    if (which === 'report'){
      tabReport.classList.add('is-active');
      tabTables.classList.remove('is-active');
      reportView.classList.remove('hidden');
      tablesView.classList.add('hidden');
      tabReport.setAttribute('aria-selected','true');
      tabTables.setAttribute('aria-selected','false');
    } else {
      tabTables.classList.add('is-active');
      tabReport.classList.remove('is-active');
      tablesView.classList.remove('hidden');
      reportView.classList.add('hidden');
      tabTables.setAttribute('aria-selected','true');
      tabReport.setAttribute('aria-selected','false');
    }
  }
  tabReport.addEventListener('click', () => setActiveTab('report'));
  tabTables.addEventListener('click', () => setActiveTab('tables'));

})();