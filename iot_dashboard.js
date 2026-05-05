(function () {
  const cfg = window.ASP_FINAL_PROJECT_CONFIG || {};
  const isConfigured = cfg.supabaseUrl && cfg.supabaseAnonKey && !cfg.supabaseUrl.includes("YOUR-");
  const params = new URLSearchParams(location.search);
  const sectionSlug = params.get("section") || cfg.defaultSectionSlug || "";
  const client = isConfigured ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey) : null;

  const IDENTITY_KEY = "iot_identity:" + sectionSlug;
  const MAX_MEMBERS = 5;

  // State
  let bootstrapData = null;     // { section, groups }
  let pendingAction = null;     // { type: "add" | "join", groupId?, groupName? }
  let selectedStudent = null;   // { studentId, studentName, sectionId } — chosen in identity modal

  // ----------------------------------------------------------------
  // Utilities
  // ----------------------------------------------------------------
  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  function getIdentity() {
    try { return JSON.parse(sessionStorage.getItem(IDENTITY_KEY) || "null"); }
    catch (_) { return null; }
  }

  function setIdentity(identity) {
    sessionStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
  }

  function clearIdentity() {
    sessionStorage.removeItem(IDENTITY_KEY);
  }

  function renderIdentityState() {
    const exitBtn = document.getElementById("exit-student-mode-btn");
    if (!exitBtn) return;
    const identity = getIdentity();
    exitBtn.style.display = identity ? "inline-flex" : "none";
    exitBtn.textContent = identity ? `Exit Student Mode (${identity.studentName})` : "Exit Student Mode";
  }

  function showError(id, msg) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = msg || "";
    el.classList.toggle("show", !!msg);
  }

  async function rpc(name, args) {
    if (!client) throw new Error("Supabase is not configured.");
    const { data, error } = await client.rpc(name, args || {});
    if (error) throw error;
    return data;
  }

  // ----------------------------------------------------------------
  // Bootstrap / Load Groups
  // ----------------------------------------------------------------
  async function loadBootstrap() {
    const container = document.getElementById("groups-container");
    if (!container) return;

    if (!isConfigured) {
      bootstrapData = { section: { id: null, slug: sectionSlug, name: sectionSlug, maxMembers: MAX_MEMBERS }, groups: [] };
      renderGroups();
      container.insertAdjacentHTML("afterbegin",
        '<div class="note" style="margin-bottom:0.75rem;">Supabase is not configured yet — group management is unavailable. Update <code>supabase-config.js</code> to enable live groups.</div>');
      return;
    }

    container.innerHTML = '<div class="groups-loading">Loading groups…</div>';
    try {
      bootstrapData = await rpc("iot_bootstrap", { p_section_slug: sectionSlug });
      renderGroups();
    } catch (err) {
      container.innerHTML = `<div class="note">Could not load groups: ${esc(err.message || "Unknown error")}.</div>`;
    }
  }

  function renderGroups() {
    const container = document.getElementById("groups-container");
    if (!container || !bootstrapData) return;

    const groups = bootstrapData.groups || [];
    const identity = getIdentity();

    // Determine if current identity is already in a group
    let myGroupId = null;
    if (identity) {
      for (const g of groups) {
        if ((g.members || []).some(m => m.id === identity.studentId)) {
          myGroupId = g.id;
          break;
        }
      }
    }

    if (groups.length === 0) {
      container.innerHTML = `
        <div class="groups-empty">
          <div class="groups-empty-icon">⚡</div>
          <div class="groups-empty-msg">No groups yet. Be the first to add your group!</div>
          <button class="btn" onclick="openAddGroupModal()">+ Add Group</button>
        </div>`;
      return;
    }

    const cards = groups.map(g => {
      const count = g.memberCount || 0;
      const isFull = count >= MAX_MEMBERS;
      const isMyGroup = myGroupId === g.id;
      const alreadyInAGroup = myGroupId !== null;

      const countClass = isFull ? "full" : "";
      const titleHtml = g.projectTitle
        ? `<div class="group-title set">${esc(g.projectTitle)}</div>`
        : `<div class="group-title">Title TBA</div>`;

      const membersHtml = (g.members && g.members.length > 0)
        ? g.members.map(m => `<span class="member-pill">${esc(m.fullName)}</span>`).join("")
        : `<span style="font-size:12px;color:var(--muted);">No members yet</span>`;

      let joinBtn = "";
      if (!isMyGroup) {
        if (isFull) {
          joinBtn = `<button class="btn btn-sm btn-outline" disabled>Full</button>`;
        } else if (alreadyInAGroup) {
          joinBtn = `<button class="btn btn-sm btn-outline" disabled title="You are already in a group">Join</button>`;
        } else {
          joinBtn = `<button class="btn btn-sm" onclick="openJoinModal('${esc(g.id)}', '${esc(g.name)}')">Join</button>`;
        }
      } else {
        joinBtn = `<span class="badge badge-green" style="font-size:11px;">Your Group</span>`;
      }

      return `
      <div class="group-card">
        <div class="group-card-header">
          <div class="group-name">${esc(g.name)}</div>
          <div class="group-count-badge ${countClass}">${count} / ${MAX_MEMBERS}</div>
        </div>
        ${titleHtml}
        <div class="member-pills">${membersHtml}</div>
        <div class="group-actions">${joinBtn}</div>
      </div>`;
    }).join("");

    container.innerHTML = `<div class="groups-grid">${cards}</div>`;
  }

  // ----------------------------------------------------------------
  // Identity Modal
  // ----------------------------------------------------------------
  let identitySearchTimeout = null;

  function openIdentityModal(onConfirmed) {
    pendingAction = onConfirmed;
    selectedStudent = null;

    document.getElementById("identity-search").value = "";
    document.getElementById("identity-dropdown").innerHTML = "";
    document.getElementById("identity-selected").innerHTML = "";
    document.getElementById("identity-id-field").style.display = "none";
    document.getElementById("identity-id-input").value = "";
    document.getElementById("identity-confirm-btn").disabled = true;
    showError("identity-error", "");

    document.getElementById("identity-modal-overlay").classList.add("open");
    setTimeout(() => document.getElementById("identity-search").focus(), 50);
  }

  function closeIdentityModal() {
    document.getElementById("identity-modal-overlay").classList.remove("open");
    pendingAction = null;
    selectedStudent = null;
  }

  window.closeIdentityModal = closeIdentityModal;

  window.exitStudentMode = function () {
    clearIdentity();
    closeIdentityModal();
    window.closeAddGroupModal();
    window.closeJoinModal();
    renderIdentityState();
    renderGroups();
  };

  window.onIdentitySearch = function (query) {
    clearTimeout(identitySearchTimeout);
    const dropdown = document.getElementById("identity-dropdown");

    if (!query || query.trim().length < 2) {
      dropdown.innerHTML = "";
      return;
    }

    identitySearchTimeout = setTimeout(async () => {
      if (!bootstrapData || !bootstrapData.section.id) {
        dropdown.innerHTML = `<div class="search-dropdown"><div class="search-no-results">Section not loaded.</div></div>`;
        return;
      }
      try {
        const results = await searchStudents(bootstrapData.section.id, query.trim());
        if (!results || results.length === 0) {
          dropdown.innerHTML = `<div class="search-dropdown"><div class="search-no-results">No students found.</div></div>`;
          return;
        }
        dropdown.innerHTML = `<div class="search-dropdown">${results.map(r => `
          <div class="search-option" onclick="selectStudentIdentity('${esc(r.id)}', '${esc(r.fullName)}')">
            <span>${esc(r.fullName)}</span>
            ${r.assignedGroup ? `<span class="assigned">in ${esc(r.assignedGroup)}</span>` : ""}
          </div>`).join("")}</div>`;
      } catch (err) {
        dropdown.innerHTML = `<div class="search-dropdown"><div class="search-no-results">Search failed: ${esc(err.message)}</div></div>`;
      }
    }, 280);
  };

  window.selectStudentIdentity = function (studentId, studentName) {
    selectedStudent = { studentId, studentName };
    document.getElementById("identity-dropdown").innerHTML = "";
    document.getElementById("identity-search").value = "";
    document.getElementById("identity-selected").innerHTML = `
      <div class="selected-student">
        <span>Selected: <strong>${esc(studentName)}</strong></span>
        <button class="deselect-btn" onclick="deselectIdentity()" title="Change">×</button>
      </div>`;
    document.getElementById("identity-id-field").style.display = "block";
    document.getElementById("identity-id-input").value = "";
    setTimeout(() => document.getElementById("identity-id-input").focus(), 50);
    document.getElementById("identity-confirm-btn").disabled = false;
    showError("identity-error", "");
  };

  window.deselectIdentity = function () {
    selectedStudent = null;
    document.getElementById("identity-selected").innerHTML = "";
    document.getElementById("identity-id-field").style.display = "none";
    document.getElementById("identity-id-input").value = "";
    document.getElementById("identity-confirm-btn").disabled = true;
  };

  window.confirmIdentityAction = async function () {
    if (!selectedStudent) {
      showError("identity-error", "Please select your name from the list first.");
      return;
    }
    const idNum = document.getElementById("identity-id-input").value.trim();
    if (!idNum) {
      showError("identity-error", "Enter your student ID number.");
      return;
    }

    const btn = document.getElementById("identity-confirm-btn");
    btn.disabled = true;
    btn.textContent = "Verifying...";
    showError("identity-error", "");

    try {
      const verified = await rpc("iot_verify_student_id", {
        p_student_id: selectedStudent.studentId,
        p_student_id_num: idNum
      });
      if (!verified) {
        showError("identity-error", "Student ID number does not match. Double-check your ID.");
        return;
      }
    } catch (err) {
      showError("identity-error", err.message || "Verification failed.");
      return;
    } finally {
      btn.disabled = false;
      btn.textContent = "Confirm";
    }

    const sectionId = bootstrapData && bootstrapData.section.id;
    const identity = {
      studentId: selectedStudent.studentId,
      studentName: selectedStudent.studentName,
      studentIdNum: idNum,
      sectionId: sectionId
    };
    setIdentity(identity);
    closeIdentityModal();
    renderIdentityState();
    renderGroups();
    if (typeof pendingAction === "function") pendingAction(identity);
  };

  // Public: open identity modal then run callback
  window.openIdentityModal = openIdentityModal;

  // ----------------------------------------------------------------
  // Add Group Modal
  // ----------------------------------------------------------------
  window.openAddGroupModal = function () {
    const identity = getIdentity();
    if (!identity) {
      openIdentityModal(function () { window.openAddGroupModal(); });
      return;
    }
    // Check if already in group
    if (bootstrapData) {
      for (const g of bootstrapData.groups || []) {
        if ((g.members || []).some(m => m.id === identity.studentId)) {
          alert("You are already in " + g.name + ". You can only be in one group.");
          return;
        }
      }
    }

    document.getElementById("new-group-name").value = "";
    document.getElementById("new-group-title").value = "";
    document.getElementById("add-group-identity-label").textContent =
      "Creating as: " + identity.studentName + ". You will be added as the first member.";
    showError("add-group-error", "");
    document.getElementById("add-group-modal-overlay").classList.add("open");
    setTimeout(() => document.getElementById("new-group-name").focus(), 50);
  };

  window.closeAddGroupModal = function () {
    document.getElementById("add-group-modal-overlay").classList.remove("open");
  };

  window.submitCreateGroup = async function () {
    const identity = getIdentity();
    if (!identity) { window.openAddGroupModal(); return; }

    const name = document.getElementById("new-group-name").value.trim();
    const title = document.getElementById("new-group-title").value.trim();
    const btn = document.getElementById("add-group-submit-btn");

    if (!name) { showError("add-group-error", "Group name is required."); return; }

    showError("add-group-error", "");
    btn.disabled = true;
    btn.textContent = "Creating…";

    try {
      const updatedGroups = await createGroup(identity.sectionId, identity.studentId, name, title, identity.studentIdNum);
      if (bootstrapData) bootstrapData.groups = updatedGroups;
      window.closeAddGroupModal();
      renderGroups();
    } catch (err) {
      showError("add-group-error", err.message || "Could not create group. Please try again.");
    } finally {
      btn.disabled = false;
      btn.textContent = "Create Group";
    }
  };

  // ----------------------------------------------------------------
  // Join Group Modal
  // ----------------------------------------------------------------
  let joinTargetGroupId = null;

  window.openJoinModal = function (groupId, groupName) {
    const identity = getIdentity();
    if (!identity) {
      openIdentityModal(function () { window.openJoinModal(groupId, groupName); });
      return;
    }

    joinTargetGroupId = groupId;
    document.getElementById("join-modal-title").textContent = "Join " + groupName;
    document.getElementById("join-modal-sub").textContent =
      "Joining as: " + identity.studentName + ". This action cannot be undone.";
    showError("join-group-error", "");
    document.getElementById("join-group-submit-btn").textContent = "Join " + groupName;
    document.getElementById("join-group-modal-overlay").classList.add("open");
  };

  window.closeJoinModal = function () {
    document.getElementById("join-group-modal-overlay").classList.remove("open");
    joinTargetGroupId = null;
  };

  window.submitJoinGroup = async function () {
    const identity = getIdentity();
    if (!identity || !joinTargetGroupId) return;

    const btn = document.getElementById("join-group-submit-btn");
    showError("join-group-error", "");
    btn.disabled = true;
    btn.textContent = "Joining…";

    try {
      const updatedGroups = await joinGroup(joinTargetGroupId, identity.studentId, identity.studentIdNum);
      if (bootstrapData) bootstrapData.groups = updatedGroups;
      window.closeJoinModal();
      renderGroups();
    } catch (err) {
      showError("join-group-error", err.message || "Could not join group. Please try again.");
    } finally {
      btn.disabled = false;
      btn.textContent = "Join Group";
    }
  };

  // ----------------------------------------------------------------
  // Supabase RPC helpers
  // ----------------------------------------------------------------
  async function searchStudents(sectionId, query) {
    return await rpc("iot_search_students", { p_section_id: sectionId, p_query: query });
  }

  async function createGroup(sectionId, studentId, groupName, projectTitle, studentIdNum) {
    return await rpc("iot_create_group", {
      p_section_id: sectionId,
      p_student_id: studentId,
      p_group_name: groupName,
      p_project_title: projectTitle || "",
      p_student_id_num: studentIdNum || null
    });
  }

  async function joinGroup(groupId, studentId, studentIdNum) {
    return await rpc("iot_join_group", {
      p_group_id: groupId,
      p_student_id: studentId,
      p_student_id_num: studentIdNum || null
    });
  }

  // Expose for potential external use
  window.searchStudents = searchStudents;
  window.createGroup = createGroup;
  window.joinGroup = joinGroup;
  window.confirmIdentity = function (studentId, studentName, sectionId) {
    setIdentity({ studentId, studentName, sectionId });
    renderIdentityState();
    renderGroups();
  };

  // ----------------------------------------------------------------
  // Documentation download
  // ----------------------------------------------------------------
  window.downloadIotTemplate = async function () {
    const identity = getIdentity();
    let group = null;
    let section = bootstrapData ? bootstrapData.section : null;

    if (identity && bootstrapData) {
      for (const g of bootstrapData.groups || []) {
        if ((g.members || []).some(m => m.id === identity.studentId)) {
          group = g;
          break;
        }
      }
    }

    await window.downloadIotDocx(group, section);
  };

  // ----------------------------------------------------------------
  // Init
  // ----------------------------------------------------------------
  renderIdentityState();
  loadBootstrap();
})();
