let blogFiles = [];
let isDescending = true;
let blogCache = {};
let discoveryComplete = false;
let teamMembers = null;
let allMembers = null;

let keySequence = "";

function toggleTheme() {
  const html = document.documentElement;
  const current = html.getAttribute("data-theme");
  const next = current === "dark" ? "light" : "dark";
  html.setAttribute("data-theme", next);
  localStorage.setItem("opendih-theme", next);
}

(function () {
  const saved = localStorage.getItem("opendih-theme");
  if (saved) {
    document.documentElement.setAttribute("data-theme", saved);
  } else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
    document.documentElement.setAttribute("data-theme", "dark");
  }
})();

function pad(num) {
  return num.toString().padStart(2, "0");
}

function formatDateFilename(date) {
  return `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()}.json`;
}

function parseDate(filename) {
  const parts = filename.replace(".json", "").split("-");
  return new Date(parts[2], parts[1] - 1, parts[0]);
}

function formatDate(filename) {
  const date = parseDate(filename);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

async function discoverBlogFiles() {
  const files = [];
  const today = new Date();
  const daysToCheck = 90;

  const checkPromises = [];
  for (let i = 0; i <= daysToCheck; i++) {
    const checkDate = new Date(today);
    checkDate.setDate(today.getDate() - i);
    const filename = formatDateFilename(checkDate);
    checkPromises.push(
      fetch(`src/blogs/${filename}`)
        .then((res) => (res.ok ? filename : null))
        .catch(() => null),
    );
  }

  const results = await Promise.all(checkPromises);
  return results.filter((f) => f !== null);
}

function escapeHtml(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

async function renderBlogs() {
  const container = document.getElementById("blog-container");
  if (!container) return;

  container.innerHTML =
    '<div style="padding: 20px; text-align:center; color: #888;">Loading publications...</div>';

  if (!discoveryComplete) {
    blogFiles = await discoverBlogFiles();
    discoveryComplete = true;
  }

  if (blogFiles.length === 0) {
    container.innerHTML =
      '<div style="padding: 20px; text-align:center;">No publications found.</div>';
    return;
  }

  const sorted = [...blogFiles].sort((a, b) =>
    isDescending ? parseDate(b) - parseDate(a) : parseDate(a) - parseDate(b),
  );

  let html = "";
  let loadedCount = 0;

  for (const file of sorted) {
    try {
      if (!blogCache[file]) {
        const res = await fetch(`src/blogs/${file}`);
        if (!res.ok) continue;
        blogCache[file] = await res.json();
      }
      const data = blogCache[file];
      if (!data.title) continue;

      loadedCount++;
      html += `
        <div class="blog-item" onclick="openBlog('${escapeHtml(file)}')">
          <div class="blog-content">
            <div class="blog-date">${formatDate(file)}</div>
            <h3 class="blog-title">${escapeHtml(data.title)}</h3>
            <p class="blog-excerpt">${escapeHtml(data.excerpt)}</p>
          </div>
          <div class="blog-arrow">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="5" y1="12" x2="19" y2="12"></line>
              <polyline points="12 5 19 12 12 19"></polyline>
            </svg>
          </div>
        </div>`;
    } catch (e) {
      console.warn("Failed to load blog:", file);
    }
  }

  container.innerHTML =
    loadedCount > 0
      ? html
      : '<div style="padding: 20px; text-align:center;">No publications found.</div>';
}

function openBlog(file) {
  const data = blogCache[file];
  if (!data) return;

  const title = escapeHtml(data.title) || "Untitled";
  const content = data.content || "";
  const date = formatDate(file);
  const authorUsername = escapeHtml(data.by) || "";
  const role = escapeHtml(data.role) || "";

  let authorHtml = "";

  if (authorUsername && allMembers) {
    const member = allMembers.find(m => m.login === authorUsername);
    if (member) {
      authorHtml = `<br><br><br><div class="blog-author" style="text-align: right; font-size: 14px;">
        <em style="color: var(--accent); display: flex; align-items: center; justify-content: flex-end; gap: 4px;">
          — 
          <a href="${member.html_url}" target="_blank" style="text-decoration: none; display: inline-flex; align-items: center;">
            <img src="${member.avatar_url}" alt="${member.name || member.login}" style="width: 25px; height: 25px; border-radius: 50%; object-fit: cover; margin: 0 4px;">
          </a>
          <span>${member.name || member.login}</span>
          ${role ? `, <span style="font-size: 14px;">${role}</span>` : ""}
        </em>
      </div>`;
    } else {
      // Fallback if member not found
      authorHtml = `<br><br><br><div class="blog-author" style="text-align: right; font-size: 16px;">
        <em><span style="color: var(--accent);">— ${authorUsername}</span>
        ${role ? `, <span style="color: var(--accent); font-size: 14px;">${role}</span>` : ""}
      </em></div>`;
    }
  }

  document.getElementById("modal-content").innerHTML = `
    <h2 class="modal-title">${title}</h2>
    <div class="modal-meta">${date}</div>
    <div class="modal-content blog-post">${content}</div>
    ${authorHtml}
    <br><br><br><br>`;

  document.getElementById("modal-overlay").classList.add("active");
  document.body.style.overflow = "hidden";
}

async function loadAllMembers() {
  try {
    const membersRes = await fetch("src/members.json");
    if (!membersRes.ok) throw new Error("Failed to load members.json");
    const membersData = await membersRes.json();
    allMembers = membersData.members;
  } catch (e) {
    console.error("Failed to load all members:", e);
    allMembers = [];
  }
}

async function loadTeamMembers() {
  try {
    const [teamsRes, membersRes] = await Promise.all([
      fetch("src/teams.json"),
      fetch("src/members.json"),
    ]);

    if (!teamsRes.ok) throw new Error("Failed to load teams.json");
    if (!membersRes.ok) throw new Error("Failed to load members.json");

    const teamsData = await teamsRes.json();
    const membersData = await membersRes.json();

    teamMembers = {
      teams: teamsData.teams
        .map((team) => ({
          ...team,
          members: team.members
            .map((username) =>
              membersData.members.find((m) => m.login === username),
            )
            .filter((m) => m !== undefined),
        }))
        .filter((team) => team.members.length > 0),
    };
  } catch (e) {
    console.error("Failed to load team members:", e);
    teamMembers = { teams: [] };
  }
}

function openTeam() {
  document.getElementById("modal-overlay").classList.add("active");
  document.body.style.overflow = "hidden";

  if (teamMembers && teamMembers.teams && teamMembers.teams.length > 0) {
    renderTeamContent();
  } else {
    document.getElementById("modal-content").innerHTML = `
      <h2 class="modal-title">Meet the Team</h2>
      <div class="team-sections">
        <div style="padding: 40px; text-align: center; color: var(--text-muted);">
          Loading team members...
        </div>
      </div>`;
    loadTeamMembers().then(() => {
      renderTeamContent();
    });
  }
}

function renderTeamContent() {
  if (!teamMembers || !teamMembers.teams || teamMembers.teams.length === 0) {
    document.getElementById("modal-content").innerHTML = `
      <h2 class="modal-title">Meet the Team</h2>
      <div class="team-sections">
        <p style="color: var(--text-muted); padding: 20px;">Failed to load team members.</p>
      </div>`;
    return;
  }

  let html = "";

  teamMembers.teams.forEach((team, index) => {
    if (index > 0) {
      html += '<div class="team-section-divider"></div>';
    }
    html += `<div class="team-section">`;
    html += `<h3 class="team-section-title">${escapeHtml(team.name)}</h3>`;
    if (team.description) {
      html += `<p class="team-section-desc">${escapeHtml(team.description)}</p>`;
    }
    html += `<div class="team-grid">`;

    team.members.forEach((member, idx) => {
      html += `
        <div class="team-member">
          <span class="team-member-num">${idx + 1}.</span>
          <a href="${member.html_url}" target="_blank" class="team-member-link">
            ${escapeHtml(member.name || member.login)} <span class="team-member-login">(@${escapeHtml(member.login)})</span>
          </a>
        </div>`;
    });

    html += `</div></div>`;
  });

  const viewAllHtml = `
    <div class="team-view-all-wrapper">
      <div class="team-section-divider"></div>
      <a href="https://github.com/orgs/OpenDih/people" target="_blank" class="team-view-all">
        <span>View all members</span>
      </a>
    </div>`;

  document.getElementById("modal-content").innerHTML = `
    <h2 class="modal-title">Meet the Team</h2>
    <div class="team-sections">${html}${viewAllHtml}</div>`;
}

function closeModal() {
  document.getElementById("modal-overlay").classList.remove("active");
  document.body.style.overflow = "auto";
}

function closeBlog() {
  closeModal();
}

function handleOverlayClick(e) {
  if (e.target.id === "modal-overlay") closeModal();
}

function toggleSort() {
  isDescending = !isDescending;
  const sortBtn = document.getElementById("sort-btn");
  if (sortBtn) {
    sortBtn.innerText = isDescending ? "Newest First" : "Oldest First";
  }
  renderBlogs();
}

function openSecretModal() {
  const today = new Date();
  const todayFilename = formatDateFilename(today);

  const footertext = document.getElementById("footer-text").textContent;
  document.getElementById("footer-text").textContent =
    "© 2026 OpenDih Research Collective. All rights not reserved.";

  let deleteOptions = blogFiles
    .map((file) => {
      const data = blogCache[file];
      const title = data ? data.title : file;
      return `<option value="${escapeHtml(file)}">${escapeHtml(title)} (${file})</option>`;
    })
    .join("");

  document.getElementById("modal-content").innerHTML = `
    <center><h2 class="modal-title">Hi lol!</h2></center>
   
`;

  document.getElementById("modal-overlay").classList.add("active");
  document.body.style.overflow = "hidden";
}
const SECRET_KEY = "iloveopendih";

function downloadNewBlog() {
  const title = document.getElementById("secret-title").value.trim();
  const excerpt = document.getElementById("secret-excerpt").value.trim();
  const content = document.getElementById("secret-content").value.trim();
  const author = document.getElementById("secret-author").value.trim();
  const role = document.getElementById("secret-role").value.trim();
  const dateStr = document.getElementById("secret-date").value.trim();

  if (!title || !excerpt || !content) {
    alert("Please fill in title, excerpt, and content");
    return;
  }

  let fullContent = content;
  if (author) {
    fullContent += `<br><br><div style="text-align: right;"><em>— ${author}${role ? ", " + role : ""}</em></div>`;
  }

  const blogData = {
    title: title,
    excerpt: excerpt,
    by: author || "",
    role: role || "",
    content: fullContent,
  };

  const blob = new Blob([JSON.stringify(blogData, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${dateStr}.json`;
  a.click();
  URL.revokeObjectURL(url);

  alert(
    `Blog file downloaded as ${dateStr}.json\n\nAdd this file to src/blogs/ directory in your repository.`,
  );
}

function deleteSelectedBlog() {
  const select = document.getElementById("secret-delete-select");
  const filename = select.value;

  if (!filename) {
    alert("Please select a blog to delete");
    return;
  }

  if (
    confirm(
      `Are you sure you want to remove "${filename}" from local cache?\n\nThis will not delete the actual file from the repository.`,
    )
  ) {
    delete blogCache[filename];
    const index = blogFiles.indexOf(filename);
    if (index > -1) {
      blogFiles.splice(index, 1);
    }
    renderBlogs();
    openSecretModal();
    alert(
      "Blog removed from local cache. Refresh or delete the actual file from the repository.",
    );
  }
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeModal();
    return;
  }

  if (
    e.target.tagName === "INPUT" ||
    e.target.tagName === "TEXTAREA" ||
    e.target.tagName === "SELECT"
  ) {
    return;
  }

  keySequence += e.key.toLowerCase();

  if (keySequence.length > SECRET_KEY.length) {
    keySequence = keySequence.slice(-SECRET_KEY.length);
  }

  if (keySequence === SECRET_KEY) {
    keySequence = "";
    openSecretModal();
  }
});

renderBlogs();
loadAllMembers();
loadTeamMembers();

// Torch / cursor spotlight effect
(function () {
  const overlay = document.getElementById("torch-overlay");
  document.addEventListener("mousemove", (e) => {
    overlay.style.setProperty("--tx", e.clientX + "px");
    overlay.style.setProperty("--ty", e.clientY + "px");
  });
})();
