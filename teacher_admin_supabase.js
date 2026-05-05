(function () {
  const cfg = window.ASP_FINAL_PROJECT_CONFIG || {};
  const isConfigured = cfg.supabaseUrl && cfg.supabaseAnonKey && !cfg.supabaseUrl.includes("YOUR-");
  if (!isConfigured) return;

  const client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  let sections = [];
  let currentSectionId = "";
  let detail = { students: [], codes: [], groups: [] };
  const PAGE_SIZES = { groups: 4, ungrouped: 12, iot: 4 };
  let pages = { groups: 1, ungrouped: 1, iot: 1 };

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function slugify(value) {
    return String(value || "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  async function rpc(name, args) {
    const { data, error } = await client.rpc(name, args || {});
    if (error) throw error;
    return data;
  }

  function clampPage(kind, totalItems) {
    const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZES[kind]));
    pages[kind] = Math.min(Math.max(1, pages[kind]), totalPages);
    return totalPages;
  }

  function pageSlice(items, kind) {
    const totalPages = clampPage(kind, items.length);
    const start = (pages[kind] - 1) * PAGE_SIZES[kind];
    return {
      items: items.slice(start, start + PAGE_SIZES[kind]),
      totalPages,
      start: items.length ? start + 1 : 0,
      end: Math.min(start + PAGE_SIZES[kind], items.length)
    };
  }

  function pagerHtml(kind, totalItems, start, end, totalPages) {
    if (totalItems <= PAGE_SIZES[kind]) return "";
    return `
      <div class="pager">
        <div class="pager-meta">Showing ${start}-${end} of ${totalItems}</div>
        <div class="pager-actions">
          <button class="btn btn-small" ${pages[kind] <= 1 ? "disabled" : ""} onclick="changePage('${kind}', -1)">Prev</button>
          <span class="pager-meta">Page ${pages[kind]} / ${totalPages}</span>
          <button class="btn btn-small" ${pages[kind] >= totalPages ? "disabled" : ""} onclick="changePage('${kind}', 1)">Next</button>
        </div>
      </div>`;
  }

  window.changePage = function (kind, delta) {
    pages[kind] = Math.max(1, pages[kind] + delta);
    render();
    if (kind === "iot") renderIotGroups(iotGroups);
  };

  window.openAdmin = async function () {
    try {
      const email = document.getElementById("admin-email").value.trim();
      const password = document.getElementById("admin-pass").value;
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      document.getElementById("login-card").style.display = "none";
      document.getElementById("admin-area").style.display = "block";
      await loadSections();
    } catch (err) {
      alert(err.message || "Could not sign in.");
    }
  };

  async function loadSections() {
    sections = await rpc("teacher_bootstrap");
    const picker = document.getElementById("section-picker");
    picker.innerHTML = sections.map(s => `<option value="${s.id}">${esc(s.name)} (${esc(s.slug)})</option>`).join("");
    currentSectionId = currentSectionId || sections[0]?.id || "";
    picker.value = currentSectionId;
    if (currentSectionId) await loadSectionDetail();
    render();
  }

  window.selectSection = async function (sectionId) {
    currentSectionId = sectionId;
    pages = { groups: 1, ungrouped: 1, iot: 1 };
    await loadSectionDetail();
    render();
  };

  async function loadSectionDetail() {
    if (!currentSectionId) {
      detail = { students: [], codes: [], groups: [] };
      return;
    }
    detail = await rpc("teacher_section_detail", { p_section_id: currentSectionId });
    await loadIotGroups();
  }

  window.createSection = async function () {
    try {
      const name = document.getElementById("section-name").value.trim();
      const slug = document.getElementById("section-slug").value.trim() || slugify(name);
      if (!name || !slug) {
        alert("Enter section name and slug.");
        return;
      }
      const section = await rpc("teacher_create_section", {
        p_name: name,
        p_slug: slug,
        p_max_groups: 8,
        p_max_members: 6
      });
      currentSectionId = section.id;
      await loadSections();
    } catch (err) {
      alert(err.message || "Could not create section.");
    }
  };

  window.saveRoster = async function () {
    try {
      if (!currentSectionId) {
        alert("Create or select a section first.");
        return;
      }
      const names = document.getElementById("roster-input").value.split("\n").map(n => n.trim()).filter(Boolean);
      await rpc("teacher_replace_roster", { p_section_id: currentSectionId, p_names: names });
      await loadSectionDetail();
      render();
    } catch (err) {
      alert(err.message || "Could not save roster.");
    }
  };

  window.loadSampleRoster = function () {
    document.getElementById("roster-input").value = Array.from({ length: 43 }, (_, i) => `Student ${String(i + 1).padStart(2, "0")}`).join("\n");
  };

  window.generateCodes = async function () {
    try {
      if (!currentSectionId) {
        alert("Create or select a section first.");
        return;
      }
      await rpc("teacher_generate_codes", { p_section_id: currentSectionId, p_count: 12 });
      await loadSectionDetail();
      render();
    } catch (err) {
      alert(err.message || "Could not generate codes.");
    }
  };

  window.copyAllCodes = async function () {
    const codes = detail.codes.map(c => c.code).join("\n");
    if (!codes) { alert("No codes to copy."); return; }
    await navigator.clipboard.writeText(codes);
    const btn = document.getElementById("copy-codes-btn");
    const orig = btn.textContent;
    btn.textContent = "Copied!";
    setTimeout(() => { btn.textContent = orig; }, 1500);
  };

  window.setGroupMaxMembers = async function (groupId, val) {
    try {
      await rpc("teacher_set_group_max_members", { p_group_id: groupId, p_max_members: parseInt(val) });
      await loadSectionDetail();
      render();
    } catch (err) {
      alert(err.message || "Could not update group limit.");
    }
  };

  window.deleteCode = async function (codeId) {
    try {
      await rpc("teacher_delete_code", { p_section_id: currentSectionId, p_code_id: codeId });
      await loadSectionDetail();
      render();
    } catch (err) {
      alert(err.message || "Could not delete code.");
    }
  };

  window.deleteUnusedCodes = async function () {
    if (!currentSectionId) return;
    const unusedCount = detail.codes.filter(c => !c.used).length;
    if (unusedCount === 0) { alert("No unused codes to delete."); return; }
    if (!confirm(`Delete ${unusedCount} unused code(s) for this section?`)) return;
    try {
      const deleted = await rpc("teacher_delete_unused_codes", { p_section_id: currentSectionId });
      await loadSectionDetail();
      render();
      alert(`Deleted ${deleted} unused code(s).`);
    } catch (err) {
      alert(err.message || "Could not delete unused codes.");
    }
  };

  window.removeGroup = async function (groupId, groupName) {
    if (!confirm(`Remove group "${groupName}"? This deletes the group, all its members, and frees the claim code and project title.`)) return;
    try {
      await rpc("teacher_remove_group", { p_group_id: groupId });
      await loadSectionDetail();
      render();
    } catch (err) {
      alert(err.message || "Could not remove group.");
    }
  };

  window.resetAllClaims = async function () {
    if (!currentSectionId) return;
    if (!confirm("Reset ALL claims for this section? This deletes every group and frees all claim codes. Roster is kept. This cannot be undone.")) return;
    try {
      await rpc("teacher_reset_claims", { p_section_id: currentSectionId });
      await loadSectionDetail();
      render();
    } catch (err) {
      alert(err.message || "Could not reset claims.");
    }
  };

  window.resetData = function () {
    alert("For Supabase, reset data from the Supabase Table Editor or SQL editor. Prototype local reset is disabled while Supabase is configured.");
  };

  // ----------------------------------------------------------------
  // IoT Group Management
  // ----------------------------------------------------------------

  let iotGroups = [];

  async function loadIotGroups() {
    const container = document.getElementById("iot-groups-list");
    if (!container) return;
    if (!currentSectionId) {
      container.innerHTML = '<div class="muted">Select a section to view IoT groups.</div>';
      iotGroups = [];
      return;
    }
    try {
      iotGroups = await rpc("teacher_iot_section_detail", { p_section_id: currentSectionId });
      renderIotRosterInfo();
      renderIotGroups(iotGroups);
    } catch (err) {
      container.innerHTML = `<div class="muted">Could not load IoT groups: ${esc(err.message || "Unknown error")}</div>`;
    }
  }

  function renderIotRosterInfo() {
    const section = sections.find(s => s.id === currentSectionId);
    const rosterCount = detail.students ? detail.students.length : 0;
    const slug = section ? section.slug : "";
    const infoEl = document.getElementById("iot-roster-info");
    if (!infoEl) return;
    if (!currentSectionId || !section) {
      infoEl.innerHTML = "";
      return;
    }
    infoEl.innerHTML = `
      <div style="font-size:12px;color:var(--muted);margin-bottom:0.75rem;display:flex;flex-wrap:wrap;gap:1rem;align-items:center;">
        <span>Roster: <strong style="color:var(--text);">${rosterCount} student${rosterCount !== 1 ? "s" : ""}</strong> — IoT identity search uses this section's roster. Upload or edit it in the Roster card above.</span>
        <span>Student URL: <code style="background:var(--surface2);padding:2px 6px;border-radius:4px;font-size:11px;">iot_student_view.html?section=${esc(slug)}</code></span>
      </div>`;
  }

  function renderIotGroups(groups) {
    const container = document.getElementById("iot-groups-list");
    if (!container) return;
    if (!groups || groups.length === 0) {
      container.innerHTML = '<div class="muted">No IoT groups yet for this section.</div>';
      return;
    }
    const paged = pageSlice(groups, "iot");
    container.innerHTML = paged.items.map(g => {
      const moveOptions = groups
        .filter(target => target.id !== g.id)
        .map(target => `<option value="${target.id}">${esc(target.name)}</option>`)
        .join("");
      const memberRows = (g.members && g.members.length > 0)
        ? g.members.map(m => `
            <div class="row" style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;">
              <span style="font-size:13px;">${esc(m.fullName)}</span>
              <div style="display:flex;gap:0.4rem;align-items:center;flex-wrap:wrap;justify-content:flex-end;">
                <select id="iot-move-${esc(m.id)}" style="width:auto;padding:3px 6px;font-size:12px;">
                  <option value="">Move to...</option>
                  ${moveOptions}
                </select>
                <button class="btn btn-small" ${moveOptions ? "" : "disabled"} onclick="moveIotMember('${esc(m.id)}')">Move</button>
                <button class="btn btn-danger btn-small" onclick="removeIotMember('${esc(g.id)}', '${esc(m.id)}', '${esc(m.fullName)}')">Remove</button>
              </div>
            </div>`).join("")
        : '<div class="muted" style="font-size:13px;">No members</div>';

      return `
      <div class="row" style="display:block;margin-bottom:0.75rem;border:1px solid var(--border);border-radius:8px;padding:0.75rem 1rem;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:0.5rem;flex-wrap:wrap;margin-bottom:0.5rem;">
          <div>
            <input id="iot-name-${esc(g.id)}" value="${esc(g.name)}" style="width:auto;min-width:120px;font-size:14px;font-weight:600;padding:3px 7px;">
            <input id="iot-title-${esc(g.id)}" value="${esc(g.projectTitle || '')}" placeholder="Project title…" style="width:auto;min-width:180px;font-size:13px;padding:3px 7px;margin-left:6px;">
          </div>
          <div style="display:flex;gap:0.5rem;">
            <button class="btn btn-small" onclick="updateIotGroup('${esc(g.id)}')">Save</button>
            <button class="btn btn-danger btn-small" onclick="removeIotGroup('${esc(g.id)}', '${esc(g.name)}')">Remove Group</button>
          </div>
        </div>
        <div class="muted" style="font-size:12px;margin-bottom:0.5rem;">${g.memberCount || 0} / 5 members</div>
        ${memberRows}
      </div>`;
    }).join("") + pagerHtml("iot", groups.length, paged.start, paged.end, paged.totalPages);
  }

  window.removeIotGroup = async function (groupId, groupName) {
    if (!confirm(`Remove IoT group "${groupName}"? This cannot be undone.`)) return;
    try {
      await rpc("teacher_iot_remove_group", { p_group_id: groupId });
      await loadIotGroups();
    } catch (err) {
      alert(err.message || "Could not remove IoT group.");
    }
  };

  window.removeIotMember = async function (groupId, studentId, studentName) {
    if (!confirm(`Remove "${studentName}" from this IoT group?`)) return;
    try {
      iotGroups = await rpc("teacher_iot_remove_member", { p_group_id: groupId, p_student_id: studentId });
      renderIotGroups(iotGroups);
    } catch (err) {
      alert(err.message || "Could not remove member.");
    }
  };

  window.updateIotGroup = async function (groupId) {
    const name = document.getElementById("iot-name-" + groupId)?.value?.trim();
    const title = document.getElementById("iot-title-" + groupId)?.value?.trim();
    if (!name) { alert("Group name cannot be empty."); return; }
    try {
      iotGroups = await rpc("teacher_iot_update_group", {
        p_group_id: groupId,
        p_name: name,
        p_project_title: title || ""
      });
      renderIotGroups(iotGroups);
    } catch (err) {
      alert(err.message || "Could not update IoT group.");
    }
  };

  window.moveIotMember = async function (studentId) {
    const select = document.getElementById("iot-move-" + studentId);
    const targetGroupId = select?.value;
    if (!targetGroupId) {
      alert("Choose a target IoT group first.");
      return;
    }
    try {
      iotGroups = await rpc("teacher_iot_move_member", {
        p_student_id: studentId,
        p_target_group_id: targetGroupId
      });
      renderIotGroups(iotGroups);
    } catch (err) {
      alert(err.message || "Could not move member.");
    }
  };

  function render() {
    const section = sections.find(s => s.id === currentSectionId);
    document.getElementById("section-name").value = section?.name || "";
    document.getElementById("section-slug").value = section?.slug || "";
    document.getElementById("roster-input").value = detail.students.map(s => s.fullName).join("\n");

    const ungrouped = detail.students.filter(s => !s.groupName);
    document.getElementById("sum-groups").textContent = detail.groups.length;
    document.getElementById("sum-claims").textContent = detail.groups.length;
    document.getElementById("sum-roster").textContent = detail.students.length;
    document.getElementById("sum-ungrouped").textContent = ungrouped.length;

    document.getElementById("codes-list").innerHTML = detail.codes.map(code => `
      <div class="row">
        <span>${esc(code.code)}</span>
        <span class="pill ${code.used ? "ok" : ""}">${code.used ? esc(code.groupName) : "Unused"}</span>
        ${!code.used ? `<button class="btn btn-danger btn-small" onclick="deleteCode('${code.id}')">Delete</button>` : ""}
      </div>`).join("") || '<div class="muted">No codes yet.</div>';

    const pagedGroups = pageSlice(detail.groups, "groups");
    document.getElementById("groups-list").innerHTML = pagedGroups.items.map(g => {
      const opts = [4,5,6,7,8].map(n =>
        `<option value="${n}" ${g.maxMembers === n ? "selected" : ""}>${n}</option>`
      ).join("");
      return `
      <div class="row" style="display:block;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:0.5rem;flex-wrap:wrap;">
          <div><strong>${esc(g.name)}</strong> <span class="pill ok">${esc(g.projectTitle)}</span></div>
          <div style="display:flex;gap:0.5rem;align-items:center;">
            <label style="font-size:11px;color:var(--muted);white-space:nowrap;">Max members:
              <select style="width:auto;padding:3px 6px;font-size:12px;" onchange="setGroupMaxMembers('${g.id}', this.value)">${opts}</select>
            </label>
            <button class="btn btn-danger btn-small" onclick="removeGroup('${g.id}', '${esc(g.name)}')">Remove</button>
          </div>
        </div>
        <div class="muted">${g.members.length}/${g.maxMembers} members</div>
        <div>${g.members.map(esc).join(", ") || "No members"}</div>
        <div style="margin-top:0.5rem;">
          <a class="btn btn-small" href="group_dashboard.html?section=${encodeURIComponent(section?.slug || "")}&code=${encodeURIComponent(g.code || "")}">Dashboard Page</a>
        </div>
      </div>`;
    }).join("") || '<div class="muted">No groups yet.</div>';
    if (detail.groups.length) {
      document.getElementById("groups-list").innerHTML += pagerHtml("groups", detail.groups.length, pagedGroups.start, pagedGroups.end, pagedGroups.totalPages);
    }

    const pagedUngrouped = pageSlice(ungrouped, "ungrouped");
    document.getElementById("ungrouped-list").innerHTML = pagedUngrouped.items.map(s => `
      <div class="row"><span>${esc(s.fullName)}</span></div>`).join("") || '<div class="muted">No ungrouped students.</div>';
    if (ungrouped.length) {
      document.getElementById("ungrouped-list").innerHTML += pagerHtml("ungrouped", ungrouped.length, pagedUngrouped.start, pagedUngrouped.end, pagedUngrouped.totalPages);
    }
  }
})();
