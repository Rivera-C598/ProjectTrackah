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
  let groupSearchResults = {};
  let groupStatusMessages = {};
  let groupStatusTimers = {};

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

  window.sanitizeIdentityIdInput = function (input) {
    if (!input) return;
    input.value = String(input.value || "").replace(/\D/g, "").slice(0, 7);
  };

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

  function setGroupStatus(groupId, message, kind) {
    if (!groupId) return;
    if (groupStatusTimers[groupId]) {
      clearTimeout(groupStatusTimers[groupId]);
      delete groupStatusTimers[groupId];
    }
    groupStatusMessages[groupId] = message ? { message, kind: kind || "info" } : null;
    if (message) {
      groupStatusTimers[groupId] = setTimeout(() => {
        groupStatusMessages[groupId] = null;
        delete groupStatusTimers[groupId];
        renderGroups();
      }, kind === "error" ? 5000 : 2500);
    }
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
    let myGroup = null;
    if (identity) {
      for (const g of groups) {
        if ((g.members || []).some(m => m.id === identity.studentId)) {
          myGroupId = g.id;
          myGroup = g;
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
      const isOwner = identity && g.ownerStudentId === identity.studentId;

      const countClass = isFull ? "full" : "";
      const titleHtml = isMyGroup && isOwner
        ? `
          <div class="group-edit-fields">
            <input class="group-edit-input" type="text" id="iot-edit-name-${esc(g.id)}" value="${esc(g.name)}" placeholder="Group name">
            <input class="group-edit-input" type="text" id="iot-edit-title-${esc(g.id)}" value="${esc(g.projectTitle || "")}" placeholder="Project title">
          </div>`
        : (g.projectTitle
          ? `<div class="group-title set">${esc(g.projectTitle)}</div>`
          : `<div class="group-title">Title TBA</div>`);

      const membersHtml = (g.members && g.members.length > 0)
        ? g.members.map(m => {
            const isMe = identity && m.id === identity.studentId;
            const canRemove = isOwner || isMe;
            const removeLabel = isMe ? "Leave" : "Remove";
            return `
              <div class="row" style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid var(--border);">
                <span class="member-pill" style="display:inline-flex;align-items:center;gap:6px;">
                  ${esc(m.fullName)}${g.ownerStudentId === m.id ? ' <strong style="font-size:10px;color:var(--accent);">OWNER</strong>' : ''}
                </span>
                ${isMyGroup && canRemove ? `<button class="btn btn-sm btn-outline" onclick="removeIotMember('${esc(g.id)}', '${esc(m.id)}', '${esc(m.fullName)}')">${removeLabel}</button>` : ""}
              </div>`;
          }).join("")
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
        joinBtn = `
          <span class="badge badge-green" style="font-size:11px;">Your Group</span>
          ${isOwner ? `<button class="btn btn-sm" onclick="saveIotGroup('${esc(g.id)}')">Save Details</button>` : ""}
          <button class="btn btn-sm btn-outline" onclick="leaveIotGroup('${esc(g.id)}', '${esc(g.name)}')">Leave Group</button>`;
      }

      const searchResults = (groupSearchResults[g.id] || []).map(r => {
        const inThisGroup = (g.members || []).some(m => m.id === r.id);
        const disabled = Boolean(r.assignedGroup) || inThisGroup || isFull;
        const label = r.assignedGroup ? `In ${r.assignedGroup}` : inThisGroup ? "Added" : "Add";
        return `
          <div class="search-option">
            <span>${esc(r.fullName)}</span>
            <button class="btn btn-sm" ${disabled ? "disabled" : ""} onclick="addIotMember('${esc(g.id)}', '${esc(r.id)}')">${esc(label)}</button>
          </div>`;
      }).join("");

      const ownerTools = isMyGroup && isOwner ? `
        <div style="margin-top:0.25rem;">
          <div class="group-inline-status ${groupStatusMessages[g.id]?.kind === "error" ? "error" : groupStatusMessages[g.id]?.kind === "success" ? "success" : ""}">${esc(groupStatusMessages[g.id]?.message || "")}</div>
          <div class="field" style="margin-bottom:0.5rem;">
            <label for="group-search-${esc(g.id)}">Add members</label>
            <input type="text" id="group-search-${esc(g.id)}" placeholder="Search the section roster" oninput="searchIotMembers('${esc(g.id)}', this.value)">
          </div>
          <div class="search-dropdown">${searchResults || '<div class="search-no-results">Search for a student to add.</div>'}</div>
        </div>` : "";

      return `
      <div class="group-card">
        <div class="group-card-header">
          <div class="group-name">${esc(g.name)}</div>
          <div class="group-count-badge ${countClass}">${count} / ${MAX_MEMBERS}</div>
        </div>
        ${titleHtml}
        <div class="member-pills">${membersHtml}</div>
        <div class="group-actions">${joinBtn}</div>
        ${ownerTools}
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
    const idInput = document.getElementById("identity-id-input");
    window.sanitizeIdentityIdInput(idInput);
    const idNum = idInput.value.trim();
    if (!idNum) {
      showError("identity-error", "Enter your student ID number.");
      return;
    }
    if (!/^\d{7}$/.test(idNum)) {
      showError("identity-error", "Student ID number must be exactly 7 digits.");
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

  async function addMemberToGroup(groupId, actorStudentId, targetStudentId, actorStudentIdNum) {
    return await rpc("iot_add_member", {
      p_group_id: groupId,
      p_actor_student_id: actorStudentId,
      p_target_student_id: targetStudentId,
      p_actor_student_id_num: actorStudentIdNum || null
    });
  }

  async function removeMemberFromGroup(groupId, actorStudentId, targetStudentId, actorStudentIdNum) {
    return await rpc("iot_remove_member", {
      p_group_id: groupId,
      p_actor_student_id: actorStudentId,
      p_target_student_id: targetStudentId,
      p_actor_student_id_num: actorStudentIdNum || null
    });
  }

  async function updateIotGroup(groupId, actorStudentId, groupName, projectTitle, actorStudentIdNum) {
    return await rpc("iot_update_group", {
      p_group_id: groupId,
      p_actor_student_id: actorStudentId,
      p_group_name: groupName,
      p_project_title: projectTitle || "",
      p_actor_student_id_num: actorStudentIdNum || null
    });
  }

  // Expose for potential external use
  window.searchStudents = searchStudents;
  window.createGroup = createGroup;
  window.joinGroup = joinGroup;
  window.searchIotMembers = async function (groupId, query) {
    if (!bootstrapData || !bootstrapData.section?.id) return;
    try {
      groupSearchResults[groupId] = await searchStudents(bootstrapData.section.id, query.trim());
      renderGroups();
      const field = document.getElementById("group-search-" + groupId);
      if (field) {
        field.value = query;
        field.focus();
      }
    } catch (err) {
      alert(err.message || "Could not search students.");
    }
  };

  window.addIotMember = async function (groupId, targetStudentId) {
    const identity = getIdentity();
    if (!identity) return;
    try {
      const updatedGroups = await addMemberToGroup(groupId, identity.studentId, targetStudentId, identity.studentIdNum);
      bootstrapData.groups = updatedGroups;
      groupSearchResults[groupId] = [];
      setGroupStatus(groupId, "Member added.", "success");
      renderGroups();
    } catch (err) {
      setGroupStatus(groupId, err.message || "Could not add member.", "error");
      renderGroups();
    }
  };

  window.removeIotMember = async function (groupId, targetStudentId, studentName) {
    const identity = getIdentity();
    if (!identity) return;
    const isSelf = identity.studentId === targetStudentId;
    if (!confirm(isSelf ? `Leave "${studentName}" from this group?` : `Remove "${studentName}" from this group?`)) return;
    try {
      const updatedGroups = await removeMemberFromGroup(groupId, identity.studentId, targetStudentId, identity.studentIdNum);
      bootstrapData.groups = updatedGroups;
      if (isSelf) {
        renderGroups();
        return;
      }
      setGroupStatus(groupId, isSelf ? "You left the group." : "Member removed.", "success");
      renderGroups();
    } catch (err) {
      setGroupStatus(groupId, err.message || "Could not remove member.", "error");
      renderGroups();
    }
  };

  window.leaveIotGroup = async function (groupId, groupName) {
    const identity = getIdentity();
    if (!identity) return;
    if (!confirm(`Leave "${groupName}"? You can join another group afterward.`)) return;
    try {
      const updatedGroups = await removeMemberFromGroup(groupId, identity.studentId, identity.studentId, identity.studentIdNum);
      bootstrapData.groups = updatedGroups;
      renderGroups();
    } catch (err) {
      alert(err.message || "Could not leave group.");
    }
  };

  window.saveIotGroup = async function (groupId) {
    const identity = getIdentity();
    if (!identity) return;
    const name = document.getElementById("iot-edit-name-" + groupId)?.value?.trim();
    const title = document.getElementById("iot-edit-title-" + groupId)?.value?.trim() || "";
    if (!name) {
      setGroupStatus(groupId, "Group name is required.", "error");
      renderGroups();
      return;
    }
    try {
      const updatedGroups = await updateIotGroup(groupId, identity.studentId, name, title, identity.studentIdNum);
      bootstrapData.groups = updatedGroups;
      setGroupStatus(groupId, "Group details saved.", "success");
      renderGroups();
    } catch (err) {
      setGroupStatus(groupId, err.message || "Could not update group details.", "error");
      renderGroups();
    }
  };
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
