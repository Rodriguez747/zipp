(function(){
  const API = 'http://localhost:3000';
  const tbody = document.getElementById('incTableBody');
  const btnFilter = document.getElementById('btnFilter');
  const btnReport = document.getElementById('btnReport');

  let filter = { type: '', severity: '', status: '' };

  async function fetchIncidents(){
    const res = await fetch(`${API}/api/incidents`);
    if(!res.ok) throw new Error('Failed to fetch incidents');
    return await res.json();
  }

  function renderCounters(rows){
    const open = rows.length;
    const resolved = rows.filter(r => (r.derived_status||r.status||'').toLowerCase()==='resolved').length;
    const progress = rows.filter(r => (r.derived_status||r.status||'').toLowerCase()==='in progress').length;
    const investigating = rows.filter(r => (r.derived_status||r.status||'').toLowerCase()==='investigating').length;
    const critical = rows.filter(r => (r.severity_level||'').toLowerCase()==='critical').length;
    document.getElementById('inc-open').textContent = open;
    document.getElementById('inc-critical').textContent = critical;
    document.getElementById('inc-progress').textContent = progress + investigating;
    document.getElementById('inc-resolved').textContent = resolved;
  }

  function applyFilter(rows){
    return rows.filter(r => {
      if(filter.type && !String(r.incident_type||'').toLowerCase().includes(filter.type.toLowerCase())) return false;
      if(filter.severity && String(r.severity_level||'').toLowerCase()!==filter.severity.toLowerCase()) return false;
      if(filter.status){
        const s = (r.derived_status||r.status||'').toLowerCase();
        if(s!==filter.status.toLowerCase()) return false;
      }
      return true;
    });
  }

  function renderRows(rows){
    tbody.innerHTML='';
    rows.forEach(r=>{
      const tr=document.createElement('tr');
      const status = (r.derived_status||r.status||'');
      tr.innerHTML = `
        <td>${r.incident_id}</td>
        <td>${r.incident_type}</td>
        <td>${r.date_reported ? new Date(r.date_reported).toISOString().slice(0,10) : ''}</td>
        <td><span class="status-${status.replace(/\s+/g,'-')}">${status}</span></td>
        <td>${r.severity_level||''}</td>
        <td>
          <button class="action-btn view-btn" data-id="${r.incident_id}">View</button>
          <button class="action-btn edit-btn" data-id="${r.incident_id}">Edit</button>
          <button class="action-btn edit-btn" data-del="${r.incident_id}">Delete</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  async function load(){
    const data = await fetchIncidents();
    renderCounters(data);
    renderRows(applyFilter(data));
  }

  function openFilter(){
    const overlay=document.createElement('div');
    overlay.className='modal-overlay';
    const modal=document.createElement('div');
    modal.className='modal';
    modal.innerHTML = `
      <div class="modal-header"><h3>Filter Incidents</h3><button class="modal-close">&times;</button></div>
      <div class="modal-body">
        <div class="form-row"><label>Type</label><input id="fType" type="text" value="${filter.type}"></div>
        <div class="form-row"><label>Severity</label><input id="fSev" type="text" value="${filter.severity}"></div>
        <div class="form-row"><label>Status</label><input id="fStat" type="text" value="${filter.status}"></div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary">Close</button>
        <button class="btn btn-primary">Apply</button>
      </div>
    `;
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    overlay.style.display='flex';
    const close=()=>document.body.removeChild(overlay);
    modal.querySelector('.modal-close').onclick=close;
    modal.querySelector('.btn-secondary').onclick=close;
    modal.querySelector('.btn-primary').onclick=async ()=>{
      filter.type = modal.querySelector('#fType').value;
      filter.severity = modal.querySelector('#fSev').value;
      filter.status = modal.querySelector('#fStat').value;
      close();
      await load();
    };
  }

  function openReport(){
    const overlay=document.createElement('div');
    overlay.className='modal-overlay';
    const modal=document.createElement('div');
    modal.className='modal';
    modal.innerHTML = `
      <div class="modal-header"><h3>Report Incident</h3><button class="modal-close">&times;</button></div>
      <div class="modal-body">
        <div class="form-row"><label>Incident Type</label><input id="rType" type="text"></div>
        <div class="form-row"><label>Reported Date</label><input id="rDate" type="date"></div>
        <div class="form-row"><label>Severity</label><input id="rSev" type="text"></div>
        <div class="form-row"><label>Link to Risk (optional risk_id)</label><input id="rRisk" type="number"></div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary">Cancel</button>
        <button class="btn btn-primary">Submit</button>
      </div>
    `;
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    overlay.style.display='flex';
    const close=()=>document.body.removeChild(overlay);
    modal.querySelector('.modal-close').onclick=close;
    modal.querySelector('.btn-secondary').onclick=close;
    modal.querySelector('.btn-primary').onclick=async ()=>{
      const payload={
        incident_type: modal.querySelector('#rType').value,
        date_reported: modal.querySelector('#rDate').value,
        severity_level: modal.querySelector('#rSev').value,
        status: 'investigating',
        risk_id: modal.querySelector('#rRisk').value ? Number(modal.querySelector('#rRisk').value) : null
      };
      const res=await fetch(`${API}/api/incidents`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      if(res.ok){ close(); await load(); } else { alert('Failed'); }
    };
  }

  tbody.addEventListener('click', async (e)=>{
    const delId = e.target && e.target.getAttribute('data-del');
    if(delId){
      if(!confirm('Delete incident?')) return;
      const res=await fetch(`${API}/api/incidents/${delId}`,{method:'DELETE'});
      if(res.ok){ await load(); } else { alert('Failed to delete'); }
    }
  });

  if(btnFilter) btnFilter.addEventListener('click', openFilter);
  if(btnReport) btnReport.addEventListener('click', openReport);

  load();
  setInterval(load, 5000);
})();