(function () {
  const cfg = window.ASP_FINAL_PROJECT_CONFIG || {};
  const isConfigured = cfg.supabaseUrl && cfg.supabaseAnonKey && !cfg.supabaseUrl.includes("YOUR-");
  if (!isConfigured) return;

  const client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  let sections = [];
  let currentSectionId = "";
  let detail = { students: [], codes: [], groups: [] };

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
    await loadSectionDetail();
    render();
  };

  async function loadSectionDetail() {
    if (!currentSectionId) {
      detail = { students: [], codes: [], groups: [] };
      return;
    }
    detail = await rpc("teacher_section_detail", { p_section_id: currentSectionId });
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

    document.getElementById("groups-list").innerHTML = detail.groups.map(g => `
      <div class="row" style="display:block;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:0.5rem;">
          <div><strong>${esc(g.name)}</strong> <span class="pill ok">${esc(g.projectTitle)}</span></div>
          <button class="btn btn-danger btn-small" onclick="removeGroup('${g.id}', '${esc(g.name)}')">Remove</button>
        </div>
        <div class="muted">${g.members.length}/6 members</div>
        <div>${g.members.map(esc).join(", ") || "No members"}</div>
        <div style="margin-top:0.5rem;">
          <a class="btn btn-small" href="group_dashboard.html?section=${encodeURIComponent(section?.slug || "")}&code=${encodeURIComponent(g.code || "")}">Dashboard Page</a>
        </div>
      </div>`).join("") || '<div class="muted">No groups yet.</div>';

    document.getElementById("ungrouped-list").innerHTML = ungrouped.map(s => `
      <div class="row"><span>${esc(s.fullName)}</span></div>`).join("") || '<div class="muted">No ungrouped students.</div>';
  }
})();
