(function(){
  const API='http://localhost:3000';
  const tbody=document.getElementById('docsTableBody');
  const btnUpload=document.getElementById('btnUpload');
  const btnFilter=document.getElementById('btnDocFilter');
  let filters={ owner:'', status:'' };

  async function fetchDocs(){
    const qs = new URLSearchParams();
    if(filters.owner) qs.set('owner', filters.owner);
    if(filters.status) qs.set('status', filters.status);
    const res=await fetch(`${API}/api/documents?${qs.toString()}`);
    if(!res.ok) throw new Error('Failed to load docs');
    return await res.json();
  }

  function renderRows(rows){
    tbody.innerHTML='';
    rows.forEach(d=>{
      const tr=document.createElement('tr');
      tr.innerHTML=`
        <td>${d.owner_dept||''}</td>
        <td>${d.document_approved ? 'Yes' : 'No'}</td>
        <td class="status">${d.approval_status||''}</td>
        <td>${d.last_review ? new Date(d.last_review).toISOString().slice(0,10) : '—'}</td>
        <td class="actions">
          <a href="#" data-view="${d.id}">View</a>
          <a href="#" data-dl="${d.id}">Download</a>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  async function load(){
    const rows=await fetchDocs();
    renderRows(rows);
  }

  function openUpload(){
    const overlay=document.createElement('div');
    overlay.className='modal-overlay';
    const modal=document.createElement('div');
    modal.className='modal';
    modal.innerHTML=`
      <div class="modal-header"><h3>Upload Document</h3><button class="modal-close">&times;</button></div>
      <div class="modal-body">
        <div class="form-row"><label>Department Owner</label><input id="uOwner" type="text"></div>
        <div class="form-row"><label>Status</label><input id="uStatus" type="text" placeholder="Approved/Under Review"></div>
        <div class="form-row"><label>Last Validated</label><input id="uLast" type="date"></div>
        <div class="form-row"><label>Document Approved</label><select id="uApproved"><option value="false">No</option><option value="true">Yes</option></select></div>
        <div class="form-row"><label>File</label><input id="uFile" type="file"></div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary">Cancel</button>
        <button class="btn btn-primary">Upload</button>
      </div>
    `;
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    overlay.style.display='flex';
    const close=()=>document.body.removeChild(overlay);
    modal.querySelector('.modal-close').onclick=close;
    modal.querySelector('.btn-secondary').onclick=close;
    modal.querySelector('.btn-primary').onclick=async ()=>{
      const fd=new FormData();
      fd.append('owner_dept', modal.querySelector('#uOwner').value);
      fd.append('approval_status', modal.querySelector('#uStatus').value);
      fd.append('last_review', modal.querySelector('#uLast').value);
      fd.append('document_approved', modal.querySelector('#uApproved').value);
      const file=modal.querySelector('#uFile').files[0];
      if(file) fd.append('file', file);
      const res=await fetch(`${API}/api/documents/upload`,{method:'POST',body:fd});
      if(res.ok){ close(); await load(); } else { alert('Upload failed'); }
    };
  }

  function openFilter(){
    const overlay=document.createElement('div');
    overlay.className='modal-overlay';
    const modal=document.createElement('div');
    modal.className='modal';
    modal.innerHTML=`
      <div class="modal-header"><h3>Filter Documents</h3><button class="modal-close">&times;</button></div>
      <div class="modal-body">
        <div class="form-row"><label>Department Owner</label><input id="fOwner" type="text" value="${filters.owner}"></div>
        <div class="form-row"><label>Status</label><input id="fStatus" type="text" value="${filters.status}"></div>
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
      filters.owner = modal.querySelector('#fOwner').value;
      filters.status = modal.querySelector('#fStatus').value;
      close();
      await load();
    };
  }

  tbody.addEventListener('click', (e)=>{
    const v=e.target && e.target.getAttribute('data-view');
    const d=e.target && e.target.getAttribute('data-dl');
    if(v){ window.open(`${API}/api/documents/${v}/view`, '_blank'); }
    if(d){ window.location.href = `${API}/api/documents/${d}/download`; }
  });

  if(btnUpload) btnUpload.addEventListener('click', openUpload);
  if(btnFilter) btnFilter.addEventListener('click', openFilter);

  load();
  setInterval(load, 5000);
})();