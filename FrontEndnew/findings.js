(function () {
	const tableBody = document.getElementById('risksTableBody');
	const modalRoot = document.getElementById('modalRoot');
	const newBtn = document.querySelector('.new-btn');
	const API_BASE = 'http://localhost:3000';

	function cryptoRandomId() {
		return 'r_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
	}

	function computeStatus(progress) {
		if (progress >= 80) return 'Ahead';
		if (progress <= 30) return 'At risk';
		return 'on track';
	}

	async function apiGetRisks() {
		const res = await fetch(`${API_BASE}/api/risks`);
		if (!res.ok) throw new Error('Failed to load risks');
		return await res.json();
	}
	async function apiGetRisk(id) {
		const res = await fetch(`${API_BASE}/api/risks/${id}`);
		if (!res.ok) throw new Error('Failed to load risk');
		return await res.json();
	}
	async function apiCreateRisk(payload) {
		const res = await fetch(`${API_BASE}/api/risks`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload)
		});
		if (!res.ok) throw new Error('Failed to create risk');
		return await res.json();
	}
	async function apiUpdateRiskTasks(id, tasks) {
		const res = await fetch(`${API_BASE}/api/risks/${id}/tasks`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ tasks })
		});
		if (!res.ok) throw new Error('Failed to update tasks');
		return await res.json();
	}

	function renderFillClass(status) {
		const s = String(status || '').toLowerCase();
		if (s === 'at risk') return 'fill-red';
		if (s === 'ahead') return 'fill-purple';
		return 'fill-green';
	}
	function statusBadgeClass(status) {
		const s = String(status || '').toLowerCase();
		if (s === 'at risk') return 'status-atrisk';
		if (s === 'ahead') return 'status-ahead';
		return 'status-ontrack';
	}

	async function render() {
		const risks = await apiGetRisks();
		tableBody.innerHTML = '';
		risks.forEach(risk => {
			const tr = document.createElement('tr');

			const nameTd = document.createElement('td');
			nameTd.className = 'risk-name';
			nameTd.textContent = risk.risk_title;

			const deptTd = document.createElement('td');
			const icon = document.createElement('span');
			icon.className = 'user-icon green';
			icon.title = 'Assigned User';
			deptTd.appendChild(icon);
			deptTd.appendChild(document.createTextNode(' ' + (risk.dept || 'Unassigned')));

			const dateTd = document.createElement('td');
			dateTd.className = 'due-date';
			const date = new Date(risk.review_date);
			dateTd.textContent = date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: '2-digit' });

			const progressTd = document.createElement('td');
			progressTd.innerHTML = `
				<div class="progress-bar">
					<div class="progress-bar-inner">
						<div class="progress-fill ${renderFillClass(risk.status)}" style="width:${risk.progress || 0}%"></div>
					</div>
					<div class="percent">${risk.progress || 0}%</div>
				</div>
			`;

			const statusTd = document.createElement('td');
			statusTd.innerHTML = `<span class="status-badge ${statusBadgeClass(risk.status)}">${risk.status || computeStatus(risk.progress || 0)}</span>`;

			const actionTd = document.createElement('td');
			const editBtn = document.createElement('button');
			editBtn.className = 'btn-edit';
			editBtn.textContent = 'Edit';
			editBtn.addEventListener('click', () => openEditModal(risk.id));
			actionTd.appendChild(editBtn);

			tr.appendChild(nameTd);
			tr.appendChild(deptTd);
			tr.appendChild(dateTd);
			tr.appendChild(progressTd);
			tr.appendChild(statusTd);
			tr.appendChild(actionTd);
			tableBody.appendChild(tr);
		});
	}

	function openNewModal() {
		openModal('New Risk', buildRiskForm(), ({ close, getValues }) => {
			return [
				{ text: 'Cancel', variant: 'secondary', onClick: () => close() },
				{ text: 'Save', variant: 'primary', onClick: async () => {
					const values = getValues();
					console.log('Submitting:', values);
					const tasks = values.tasks.map(t => ({ label: t.label, weight: t.weight, done: false }));
					await apiCreateRisk({ risk_title: values.title, dept: values.dept, review_date: values.dueDate, tasks });
					await render();
					close();
				} }
			];
		});
	}

	async function openEditModal(riskId) {
		const risk = await apiGetRisk(riskId);
		openModal('Edit Risk Progress', buildTaskChecklist(risk), ({ close, getTaskValues }) => {
			return [
				{ text: 'Close', variant: 'secondary', onClick: () => close() },
				{ text: 'Save Changes', variant: 'primary', onClick: async () => {
					const updates = getTaskValues(); // [{id, done}]
					await apiUpdateRiskTasks(riskId, updates);
					await render();
					close();
				} }
			];
		});
	}

	function openModal(title, bodyEl, actionsBuilder) {
		const overlay = document.createElement('div');
		overlay.className = 'modal-overlay';
		const modal = document.createElement('div');
		modal.className = 'modal';

		const header = document.createElement('div');
		header.className = 'modal-header';
		const h3 = document.createElement('h3');
		h3.textContent = title;
		const closeBtn = document.createElement('button');
		closeBtn.className = 'modal-close';
		closeBtn.innerHTML = '&times;';
		closeBtn.addEventListener('click', close);
		header.appendChild(h3);
		header.appendChild(closeBtn);

		const body = document.createElement('div');
		body.className = 'modal-body';
		if (bodyEl) body.appendChild(bodyEl);

		const actions = document.createElement('div');
		actions.className = 'modal-actions';
		const makeActions = actionsBuilder({ close, getValues, getTaskValues });
		makeActions.forEach(a => {
			const b = document.createElement('button');
			b.className = `btn ${a.variant ? 'btn-' + a.variant : ''}`;
			b.textContent = a.text;
			b.addEventListener('click', a.onClick);
			actions.appendChild(b);
		});

		modal.appendChild(header);
		modal.appendChild(body);
		modal.appendChild(actions);
		overlay.appendChild(modal);
		modalRoot.appendChild(overlay);
		overlay.style.display = 'flex';

		function close() {
			modalRoot.removeChild(overlay);
		}
		function getValues() { return currentFormValues(); }
		function getTaskValues() { return currentTaskValues(); }

		let currentFormValues = () => ({});
		let currentTaskValues = () => [];

		if (bodyEl && bodyEl.__bindValues__) {
			const { setValuesGetter } = bodyEl.__bindValues__;
			setValuesGetter(fn => { currentFormValues = fn; });
		}
		if (bodyEl && bodyEl.__bindTaskGetter__) {
			const { setTaskGetter } = bodyEl.__bindTaskGetter__;
			setTaskGetter(fn => { currentTaskValues = fn; });
		}
	}

	function buildRiskForm() {
		const container = document.createElement('div');

		const titleRow = formRow('Risk Title', 'text', '');
		const deptRow = formRow('Assign To (Dept/Owner)', 'text', '');
		const dateRow = formRow('Due Date', 'date', new Date().toISOString().slice(0, 10));

		const tasksHeader = document.createElement('div');
		tasksHeader.style.fontWeight = '700';
		tasksHeader.style.margin = '10px 0 6px';
		tasksHeader.textContent = 'Tasks Checklist (weights sum to 100%)';

		const tasksList = document.createElement('div');
		tasksList.className = 'tasks-list';

		let customized = false;
		function seedTasksByTitle() {
			const titleVal = (titleRow.input.value || '').trim();
			const seeded = defaultTasks(titleVal || 'generic');
			tasksList.innerHTML = '';
			seeded.forEach(t => tasksList.appendChild(taskItemRow(t)));
		}
		seedTasksByTitle();
		titleRow.input.addEventListener('change', () => { if (!customized) seedTasksByTitle(); });
		tasksList.addEventListener('input', () => { customized = true; });
		tasksList.addEventListener('click', (e) => {
			const target = e.target;
			if (target && target.classList && target.classList.contains('btn-danger')) customized = true;
		});

		const addTaskBtn = document.createElement('button');
		addTaskBtn.className = 'btn btn-secondary';
		addTaskBtn.textContent = 'Add Task';
		addTaskBtn.addEventListener('click', () => {
			customized = true;
			const t = { id: cryptoRandomId(), label: 'New task', weight: 10, done: false };
			tasksList.appendChild(taskItemRow(t));
		});

		container.appendChild(titleRow.row);
		container.appendChild(deptRow.row);
		container.appendChild(dateRow.row);
		container.appendChild(tasksHeader);
		container.appendChild(tasksList);
		container.appendChild(addTaskBtn);

		container.__bindValues__ = {
			setValuesGetter: (fn) => {
				fn(() => ({
					title: titleRow.input.value.trim() || 'Untitled Risk',
					dept: deptRow.input.value.trim() || 'Unassigned',
					dueDate: dateRow.input.value,
					tasks: collectTasks(tasksList)
				}));
			}
		};

		return container;
	}

	function buildTaskChecklist(risk) {
		const container = document.createElement('div');
		const title = document.createElement('div');
		title.style.fontWeight = '700';
		title.style.marginBottom = '6px';
		title.textContent = risk.risk_title;
		container.appendChild(title);

		const tasksList = document.createElement('div');
		tasksList.className = 'tasks-list';
		(risk.tasks || []).forEach(t => {
			const el = taskCheckboxRow(t);
			tasksList.appendChild(el);
		});
		container.appendChild(tasksList);

		const progressPreview = document.createElement('div');
		progressPreview.style.marginTop = '8px';
		progressPreview.style.fontWeight = '700';
		progressPreview.textContent = `Progress: ${risk.progress || 0}%`;
		container.appendChild(progressPreview);

		container.__bindTaskGetter__ = {
			setTaskGetter: (fn) => {
				fn(() => collectTasksFromChecklist(tasksList, progressPreview));
			}
		};

		return container;
	}

	function formRow(labelText, type, value) {
		const row = document.createElement('div');
		row.className = 'form-row';
		const label = document.createElement('label');
		label.textContent = labelText;
		const input = document.createElement('input');
		input.type = type;
		input.value = value;
		row.appendChild(label);
		row.appendChild(input);
		return { row, input };
	}

	function taskItemRow(task) {
		const item = document.createElement('div');
		item.className = 'task-item';
		const left = document.createElement('input');
		left.type = 'text';
		left.value = task.label;
		left.style.flex = '1';
		const weight = document.createElement('input');
		weight.type = 'number';
		weight.value = String(task.weight);
		weight.min = '0';
		weight.max = '100';
		weight.style.width = '80px';
		const weightTag = document.createElement('span');
		weightTag.className = 'weight';
		weightTag.textContent = '%';
		const del = document.createElement('button');
		del.className = 'btn btn-danger';
		del.textContent = 'Remove';
		del.addEventListener('click', () => item.remove());
		item.appendChild(left);
		item.appendChild(weight);
		item.appendChild(weightTag);
		item.appendChild(del);
		return item;
	}

	function taskCheckboxRow(task) {
		const item = document.createElement('div');
		item.className = 'task-item';
		item.dataset.id = String(task.id);
		const left = document.createElement('label');
		left.style.display = 'flex';
		left.style.alignItems = 'center';
		left.style.gap = '10px';
		const checkbox = document.createElement('input');
		checkbox.type = 'checkbox';
		checkbox.checked = !!task.done;
		checkbox.addEventListener('change', () => {/* live preview handled on save */});
		const span = document.createElement('span');
		span.textContent = task.label;
		left.appendChild(checkbox);
		left.appendChild(span);
		const weight = document.createElement('span');
		weight.className = 'weight';
		weight.textContent = `+${task.weight}%`;
		item.appendChild(left);
		item.appendChild(weight);
		return item;
	}

	function collectTasks(tasksList) {
		const tasks = [];
		Array.from(tasksList.children).forEach(child => {
			if (!child.classList.contains('task-item')) return;
			const [labelInput, weightInput] = child.querySelectorAll('input');
			const label = (labelInput && labelInput.value ? labelInput.value.trim() : 'Task').slice(0, 200);
			const weight = clamp(parseInt(weightInput && weightInput.value || '0', 10) || 0, 0, 100);
			tasks.push({ id: cryptoRandomId(), label, weight, done: false });
		});
		const sum = tasks.reduce((s, t) => s + t.weight, 0);
		if (sum !== 100 && sum > 0) {
			tasks.forEach(t => { t.weight = Math.round((t.weight / sum) * 100); });
			let diff = 100 - tasks.reduce((s, t) => s + t.weight, 0);
			for (let i = 0; i < Math.abs(diff); i++) tasks[i % tasks.length].weight += Math.sign(diff);
		}
		return tasks;
	}

	function collectTasksFromChecklist(tasksList, previewEl) {
		const tasks = [];
		Array.from(tasksList.children).forEach(child => {
			if (!child.classList.contains('task-item')) return;
			const checkbox = child.querySelector('input[type="checkbox"]');
			const weightText = child.querySelector('.weight')?.textContent || '+0%';
			const weight = parseInt(weightText.replace(/[^0-9]/g, ''), 10) || 0;
			const id = child.dataset.id;
			tasks.push({ id: Number(id), done: !!(checkbox && checkbox.checked), weight });
		});
		if (previewEl) {
			const progress = Math.round(tasks.reduce((sum, t) => sum + (t.done ? t.weight : 0), 0));
			previewEl.textContent = `Progress: ${progress}%`;
		}
		return tasks.map(({ id, done }) => ({ id, done }));
	}

	function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

	if (newBtn) newBtn.addEventListener('click', openNewModal);

	render();

	// Task seeds
	function defaultTasks(riskName) {
		if (/gdpr violation/i.test(riskName)) {
			return [
				{ id: cryptoRandomId(), label: 'Assess data exposure', weight: 20, done: false },
				{ id: cryptoRandomId(), label: 'Notify DPO and legal', weight: 15, done: false },
				{ id: cryptoRandomId(), label: 'Report to authorities', weight: 15, done: false },
				{ id: cryptoRandomId(), label: 'Notify affected individuals', weight: 15, done: false },
				{ id: cryptoRandomId(), label: 'Remediate breach', weight: 20, done: false },
				{ id: cryptoRandomId(), label: 'Review policies & train staff', weight: 15, done: false }
			];
		}
		if (/data breach/i.test(riskName)) {
			return [
				{ id: cryptoRandomId(), label: 'Isolate affected systems', weight: 20, done: false },
				{ id: cryptoRandomId(), label: 'Investigate breach source', weight: 20, done: false },
				{ id: cryptoRandomId(), label: 'Notify IT/security team', weight: 15, done: false },
				{ id: cryptoRandomId(), label: 'Patch vulnerabilities', weight: 15, done: false },
				{ id: cryptoRandomId(), label: 'Communicate with stakeholders', weight: 15, done: false },
				{ id: cryptoRandomId(), label: 'Document and report', weight: 15, done: false }
			];
		}
		if (/product contamination/i.test(riskName)) {
			return [
				{ id: cryptoRandomId(), label: 'Quarantine affected products', weight: 20, done: false },
				{ id: cryptoRandomId(), label: 'Notify quality assurance', weight: 15, done: false },
				{ id: cryptoRandomId(), label: 'Conduct root cause analysis', weight: 20, done: false },
				{ id: cryptoRandomId(), label: 'Recall products if needed', weight: 20, done: false },
				{ id: cryptoRandomId(), label: 'Remediate contamination', weight: 15, done: false },
				{ id: cryptoRandomId(), label: 'Review and update SOPs', weight: 10, done: false }
			];
		}
		if (/labeling error|mislabeling/i.test(riskName)) {
			return [
				{ id: cryptoRandomId(), label: 'Identify mislabeled products', weight: 20, done: false },
				{ id: cryptoRandomId(), label: 'Notify regulatory team', weight: 15, done: false },
				{ id: cryptoRandomId(), label: 'Correct labeling', weight: 20, done: false },
				{ id: cryptoRandomId(), label: 'Recall if distributed', weight: 20, done: false },
				{ id: cryptoRandomId(), label: 'Communicate with customers', weight: 15, done: false },
				{ id: cryptoRandomId(), label: 'Review labeling process', weight: 10, done: false }
			];
		}
		if (/safety hazard - workplace/i.test(riskName)) {
			return [
				{ id: cryptoRandomId(), label: 'Isolate hazard area', weight: 20, done: false },
				{ id: cryptoRandomId(), label: 'Notify safety officer', weight: 15, done: false },
				{ id: cryptoRandomId(), label: 'Investigate root cause', weight: 20, done: false },
				{ id: cryptoRandomId(), label: 'Remediate hazard', weight: 20, done: false },
				{ id: cryptoRandomId(), label: 'Conduct safety training', weight: 15, done: false },
				{ id: cryptoRandomId(), label: 'Update safety protocols', weight: 10, done: false }
			];
		}
		if (/adverse customer reaction/i.test(riskName)) {
			return [
				{ id: cryptoRandomId(), label: 'Document incident', weight: 20, done: false },
				{ id: cryptoRandomId(), label: 'Notify customer service', weight: 15, done: false },
				{ id: cryptoRandomId(), label: 'Investigate cause', weight: 20, done: false },
				{ id: cryptoRandomId(), label: 'Provide remedy to customer', weight: 20, done: false },
				{ id: cryptoRandomId(), label: 'Review product/process', weight: 15, done: false },
				{ id: cryptoRandomId(), label: 'Report to management', weight: 10, done: false }
			];
		}
		if (/fraud|misconduct/i.test(riskName)) {
			return [
				{ id: cryptoRandomId(), label: 'Suspend involved parties', weight: 20, done: false },
				{ id: cryptoRandomId(), label: 'Notify compliance/legal', weight: 15, done: false },
				{ id: cryptoRandomId(), label: 'Conduct investigation', weight: 20, done: false },
				{ id: cryptoRandomId(), label: 'Document findings', weight: 15, done: false },
				{ id: cryptoRandomId(), label: 'Implement corrective actions', weight: 20, done: false },
				{ id: cryptoRandomId(), label: 'Review controls', weight: 10, done: false }
			];
		}
		if (/policy violation/i.test(riskName)) {
			return [
				{ id: cryptoRandomId(), label: 'Document violation', weight: 20, done: false },
				{ id: cryptoRandomId(), label: 'Notify HR/compliance', weight: 15, done: false },
				{ id: cryptoRandomId(), label: 'Investigate incident', weight: 20, done: false },
				{ id: cryptoRandomId(), label: 'Counsel involved parties', weight: 20, done: false },
				{ id: cryptoRandomId(), label: 'Implement corrective actions', weight: 15, done: false },
				{ id: cryptoRandomId(), label: 'Review and update policy', weight: 10, done: false }
			];
		}
		if (/system failure|downtime/i.test(riskName)) {
			return [
				{ id: cryptoRandomId(), label: 'Notify IT support', weight: 20, done: false },
				{ id: cryptoRandomId(), label: 'Diagnose failure', weight: 20, done: false },
				{ id: cryptoRandomId(), label: 'Restore system', weight: 20, done: false },
				{ id: cryptoRandomId(), label: 'Communicate outage', weight: 15, done: false },
				{ id: cryptoRandomId(), label: 'Review incident', weight: 15, done: false },
				{ id: cryptoRandomId(), label: 'Update recovery plan', weight: 10, done: false }
			];
		}
		if (/inventory loss|theft/i.test(riskName)) {
			return [
				{ id: cryptoRandomId(), label: 'Secure area', weight: 20, done: false },
				{ id: cryptoRandomId(), label: 'Notify security', weight: 15, done: false },
				{ id: cryptoRandomId(), label: 'Investigate loss', weight: 20, done: false },
				{ id: cryptoRandomId(), label: 'Document incident', weight: 15, done: false },
				{ id: cryptoRandomId(), label: 'Report to authorities', weight: 20, done: false },
				{ id: cryptoRandomId(), label: 'Review inventory controls', weight: 10, done: false }
			];
		}
		if (/supplier non-compliance/i.test(riskName)) {
			return [
				{ id: cryptoRandomId(), label: 'Notify procurement', weight: 20, done: false },
				{ id: cryptoRandomId(), label: 'Assess impact', weight: 20, done: false },
				{ id: cryptoRandomId(), label: 'Engage supplier', weight: 20, done: false },
				{ id: cryptoRandomId(), label: 'Document non-compliance', weight: 15, done: false },
				{ id: cryptoRandomId(), label: 'Implement contingency', weight: 15, done: false },
				{ id: cryptoRandomId(), label: 'Review supplier agreements', weight: 10, done: false }
			];
		}
		if (/budget|overrun/i.test(riskName)) {
			return [
				{ id: cryptoRandomId(), label: 'Baseline current spend', weight: 15, done: false },
				{ id: cryptoRandomId(), label: 'Negotiate vendor discounts', weight: 20, done: false },
				{ id: cryptoRandomId(), label: 'Freeze nonessential purchases', weight: 15, done: false },
				{ id: cryptoRandomId(), label: 'Weekly cost variance review', weight: 15, done: false },
				{ id: cryptoRandomId(), label: 'Automate spend alerts', weight: 15, done: false },
				{ id: cryptoRandomId(), label: 'Reforecast budget with stakeholders', weight: 20, done: false }
			];
		}
		if (/breach/i.test(riskName)) {
			return [
				{ id: cryptoRandomId(), label: 'Enable MFA for all privileged accounts', weight: 20, done: false },
				{ id: cryptoRandomId(), label: 'Patch critical systems', weight: 20, done: false },
				{ id: cryptoRandomId(), label: 'Encrypt sensitive data at rest', weight: 15, done: false },
				{ id: cryptoRandomId(), label: 'Implement IDS/IPS monitoring', weight: 15, done: false },
				{ id: cryptoRandomId(), label: 'Employee security awareness training', weight: 10, done: false },
				{ id: cryptoRandomId(), label: 'Backup and disaster recovery test', weight: 20, done: false }
			];
		}
		return [
			{ id: cryptoRandomId(), label: 'Define mitigation plan', weight: 20, done: false },
			{ id: cryptoRandomId(), label: 'Assign owner(s)', weight: 10, done: false },
			{ id: cryptoRandomId(), label: 'Identify key milestones', weight: 15, done: false },
			{ id: cryptoRandomId(), label: 'Execute main mitigation tasks', weight: 35, done: false },
			{ id: cryptoRandomId(), label: 'Validate outcomes', weight: 10, done: false },
			{ id: cryptoRandomId(), label: 'Close-out and document', weight: 10, done: false }
		];
	}

	// Function to fetch and display all risks in the table
	async function loadRisks() {
		const res = await fetch('http://localhost:3000/api/risks');
		const risks = await res.json();
		const tableBody = document.getElementById('risks-table-body');
		if (!tableBody) return;
		tableBody.innerHTML = '';
		risks.forEach(risk => {
			const row = document.createElement('tr');
			row.innerHTML = `
				<td>${risk.id}</td>
				<td>${risk.risk_title}</td>
				<td>${risk.dept}</td>
				<td>${risk.review_date}</td>
				<td>${risk.status}</td>
			`;
			tableBody.appendChild(row);
		});
	}

	// Handle form submission (only if form exists on page)
	const findingsForm = document.getElementById('findings-form');
	if (findingsForm) {
		findingsForm.addEventListener('submit', async function(e) {
			e.preventDefault();
			// Gather form data
			const risk_title = document.getElementById('risk_title').value;
			const dept = document.getElementById('dept').value;
			const review_date = document.getElementById('review_date').value;
			// Gather tasks as an array (adjust as per your form structure)
			const tasks = [
				// Example: { label: 'Task 1', weight: 1, done: false }
				// Populate this array from your form inputs
			];

			const res = await fetch('http://localhost:3000/api/risks', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ risk_title, dept, review_date, tasks })
			});

			if (res.ok) {
				// After saving, reload the risks table
				await loadRisks();
				// Optionally, reset the form
				this.reset();
			} else {
				alert('Failed to save finding!');
			}
		});

		// On page load, display all risks for this form page
		window.onload = loadRisks;
	}
})();