import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import {
  getDownloadURL,
  getStorage,
  ref,
  uploadBytes
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyArjp8Ewh7IBwL8kldIZxm6AITmarDre08",
  authDomain: "sharedspace-6ac5c.firebaseapp.com",
  projectId: "sharedspace-6ac5c",
  storageBucket: "sharedspace-6ac5c.firebasestorage.app",
  messagingSenderId: "1058369729284",
  appId: "1:1058369729284:web:4505f5df90db511be71651"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const provider = new GoogleAuthProvider();

const state = {
  user: null,
  profile: null,
  ideas: [],
  unsubscribe: null,
  filters: {
    search: "",
    type: "all",
    category: "all"
  }
};

const root = document.querySelector("#app");
const template = document.querySelector("#idea-card-template");

const icons = {
  search: `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path></svg>`,
  plus: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"></path><path d="M12 5v14"></path></svg>`,
  copy: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path></svg>`,
  user: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`
};

onAuthStateChanged(auth, async user => {
  state.user = user;
  if (!user) {
    state.profile = null;
    if (state.unsubscribe) state.unsubscribe();
    renderAuth();
    return;
  }

  await ensureProfile(user);
  renderApp();
  listenForIdeas();
});

function renderAuth() {
  root.innerHTML = `
    <main class="auth-screen">
      <section class="auth-card">
        <div class="brand-mark">S</div>
        <h1>SharedSpace</h1>
        <p>A private visual second brain for video ideas, references, hooks, research, and agent-readable creative memory.</p>
        <button class="button accent" id="sign-in">Continue with Google</button>
      </section>
    </main>
  `;
  document.querySelector("#sign-in").addEventListener("click", () => signInWithPopup(auth, provider));
}

async function ensureProfile(user) {
  const profileRef = doc(db, "profiles", user.uid);
  const snapshot = await getDoc(profileRef);

  if (!snapshot.exists()) {
    const agentToken = crypto.randomUUID().replaceAll("-", "");
    await setDoc(profileRef, {
      displayName: user.displayName || "Creative teammate",
      email: user.email || "",
      photoURL: user.photoURL || "",
      agentToken,
      createdAt: serverTimestamp()
    });
    await setDoc(doc(db, "agentTokens", agentToken), {
      uid: user.uid,
      label: `${user.displayName || "User"} agent token`,
      createdAt: serverTimestamp()
    });
    state.profile = { agentToken };
    return;
  }

  state.profile = snapshot.data();
}

function listenForIdeas() {
  if (state.unsubscribe) state.unsubscribe();
  const ideasQuery = query(collection(db, "ideas"), orderBy("createdAt", "desc"));
  state.unsubscribe = onSnapshot(ideasQuery, snapshot => {
    state.ideas = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
    renderLibrary();
  }, error => {
    toast(`Could not load ideas: ${error.message}`);
  });
}

function renderApp() {
  root.innerHTML = `
    <main class="app-shell">
      <header class="topbar">
        <div class="brand">
          <div class="brand-mark">S</div>
          <div>
            <h1>SharedSpace</h1>
            <p>Visual memory for future videos</p>
          </div>
        </div>
        <div class="user-strip">
          <span class="profile-chip">
            ${state.user.photoURL ? `<img src="${escapeAttr(state.user.photoURL)}" alt="">` : icons.user}
            ${escapeHtml(state.user.displayName || "Signed in")}
          </span>
          <button class="ghost-button" id="ai-settings-button">${icons.user} AI setup</button>
          <button class="ghost-button" id="profile-button">${icons.copy} Agent skill</button>
          <button class="ghost-button" id="sign-out">Sign out</button>
        </div>
      </header>
      <section class="workspace">
        <aside class="panel">
          <h2>Save an idea</h2>
          <form id="idea-form">
            <div class="field">
              <label for="url">Link</label>
              <input id="url" name="url" type="url" placeholder="Paste YouTube, X, Instagram, article..." />
            </div>
            <div class="field">
              <label for="title">Title or hook</label>
              <div class="title-row">
                <input id="title" name="title" type="text" placeholder="Auto-filled when possible" />
                <button class="ghost-button compact" id="suggest-title" type="button">Suggest</button>
              </div>
            </div>
            <div class="two-fields">
              <div class="field">
                <label for="type">Type</label>
                <select id="type" name="type">
                  <option value="auto">Detect</option>
                  <option value="youtube">YouTube</option>
                  <option value="tweet">X / Tweet</option>
                  <option value="instagram">Instagram</option>
                  <option value="article">Article</option>
                  <option value="screenshot">Screenshot</option>
                  <option value="idea">Loose idea</option>
                </select>
              </div>
              <div class="field">
                <label for="savedDatePreview">Saved date</label>
                <input id="savedDatePreview" type="date" value="${todayDate()}" disabled />
              </div>
            </div>
            <div class="field">
              <label for="categories">Categories</label>
              <input id="categories" name="categories" type="text" placeholder="Separate with commas" />
            </div>
            <div class="field">
              <label for="note">Notes</label>
              <textarea id="note" name="note" placeholder="Reaction, angle, hook, reference, assignment..."></textarea>
            </div>
            <label class="drop-zone" for="file">
              <input id="file" name="file" type="file" accept="image/*" />
              <span id="file-label">Add screenshot or custom thumbnail</span>
            </label>
            <button class="button accent" type="submit" style="width:100%; margin-top: 14px;">${icons.plus} Save to library</button>
          </form>
        </aside>
        <section>
          <div class="toolbar">
            <div class="search-wrap">${icons.search}<input id="search" type="search" placeholder="Search ideas, channels, notes, categories..." /></div>
            <select id="type-filter" class="ghost-button" aria-label="Filter by type"></select>
            <select id="category-filter" class="ghost-button" aria-label="Filter by category"></select>
          </div>
          <div id="library"></div>
        </section>
      </section>
    </main>
    <div class="modal" id="profile-modal" role="dialog" aria-modal="true"></div>
    <div class="toast" id="toast"></div>
  `;

  document.querySelector("#sign-out").addEventListener("click", () => signOut(auth));
  document.querySelector("#profile-button").addEventListener("click", openProfileModal);
  document.querySelector("#ai-settings-button").addEventListener("click", openAiSettingsModal);
  document.querySelector("#suggest-title").addEventListener("click", suggestTitleForForm);
  document.querySelector("#idea-form").addEventListener("submit", saveIdea);
  document.querySelector("#file").addEventListener("change", event => {
    document.querySelector("#file-label").textContent = event.target.files[0]?.name || "Add screenshot or custom thumbnail";
  });
  document.querySelector("#search").addEventListener("input", event => {
    state.filters.search = event.target.value.toLowerCase();
    renderLibrary();
  });
  document.querySelector("#type-filter").addEventListener("change", event => {
    state.filters.type = event.target.value;
    renderLibrary();
  });
  document.querySelector("#category-filter").addEventListener("change", event => {
    state.filters.category = event.target.value;
    renderLibrary();
  });
}

async function saveIdea(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const url = clean(data.get("url"));
  const manualTitle = clean(data.get("title"));
  const selectedType = data.get("type");
  const file = data.get("file");
  const detected = detectType(url, selectedType);
  const categories = clean(data.get("categories"))
    .split(",")
    .map(category => category.trim())
    .filter(Boolean);

  const button = form.querySelector("button[type='submit']");
  button.disabled = true;
  button.textContent = "Saving...";

  try {
    const metadata = await enrichMetadata(url, detected, manualTitle);
    let uploadedImage = "";

    if (file && file.size) {
      const path = `idea-assets/${state.user.uid}/${Date.now()}-${file.name}`;
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, file);
      uploadedImage = await getDownloadURL(storageRef);
    }

    await addDoc(collection(db, "ideas"), {
      url,
      title: manualTitle || metadata.title || "Untitled idea",
      type: detected,
      source: metadata.source || sourceLabel(detected),
      author: metadata.author || "",
      thumbnail: uploadedImage || metadata.thumbnail || "",
      note: clean(data.get("note")),
      categories,
      savedDate: todayDate(),
      ownerId: state.user.uid,
      ownerName: state.user.displayName || state.user.email || "Team member",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    form.reset();
    document.querySelector("#file-label").textContent = "Add screenshot or custom thumbnail";
    toast("Saved to the second brain.");
  } catch (error) {
    toast(`Save failed: ${error.message}`);
  } finally {
    button.disabled = false;
    button.innerHTML = `${icons.plus} Save to library`;
  }
}

async function enrichMetadata(url, type, manualTitle) {
  if (!url) return { title: manualTitle, source: "Idea" };

  if (type === "youtube") {
    const id = getYouTubeId(url);
    const thumbnail = id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : "";
    const noembed = await fetchNoembed(url);
    return {
      title: noembed.title || manualTitle || "YouTube video",
      author: noembed.author_name || "",
      source: "YouTube",
      thumbnail: noembed.thumbnail_url || thumbnail
    };
  }

  if (type === "tweet") {
    const tweet = parseTweet(url);
    const title = manualTitle || tweet.title;
    return {
      title,
      author: tweet.author,
      source: "X",
      thumbnail: generatedSocialThumbnail({
        platform: "X",
        title,
        author: tweet.author,
        url,
        theme: "x"
      })
    };
  }

  if (type === "instagram") {
    const noembed = await fetchNoembed(url);
    const title = noembed.title || manualTitle || "Instagram reference";
    const author = noembed.author_name || instagramAuthor(url) || "Instagram";
    return {
      title,
      author,
      source: "Instagram",
      thumbnail: noembed.thumbnail_url || generatedSocialThumbnail({
        platform: "Instagram",
        title,
        author,
        url,
        theme: "instagram"
      })
    };
  }

  return {
    title: manualTitle || titleFromUrl(url),
    source: sourceLabel(type),
    thumbnail: ""
  };
}

async function fetchNoembed(url) {
  try {
    const response = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(url)}`);
    if (!response.ok) return {};
    return response.json();
  } catch {
    return {};
  }
}

function renderLibrary() {
  if (!state.user || !document.querySelector("#library")) return;
  renderFilters();
  const library = document.querySelector("#library");
  const ideas = filteredIdeas();

  if (!ideas.length) {
    library.innerHTML = `
      <div class="empty-state">
        <div>
          <h2>${state.ideas.length ? "Nothing matches yet" : "Start building the library"}</h2>
          <p>Save links, screenshots, reactions, hooks, and references. The saved date is added automatically, and categories stay empty until you add them.</p>
        </div>
      </div>
    `;
    return;
  }

  library.innerHTML = `<div class="masonry" id="masonry"></div>`;
  const masonry = document.querySelector("#masonry");
  ideas.forEach(idea => masonry.appendChild(renderCard(idea)));
}

function renderFilters() {
  const typeFilter = document.querySelector("#type-filter");
  const categoryFilter = document.querySelector("#category-filter");
  if (!typeFilter || !categoryFilter) return;

  const types = ["all", ...new Set(state.ideas.map(idea => idea.type).filter(Boolean))];
  const categories = ["all", ...new Set(state.ideas.flatMap(idea => idea.categories || []))];
  typeFilter.innerHTML = types.map(type => `<option value="${escapeAttr(type)}">${type === "all" ? "All types" : sourceLabel(type)}</option>`).join("");
  categoryFilter.innerHTML = categories.map(category => `<option value="${escapeAttr(category)}">${category === "all" ? "All categories" : escapeHtml(category)}</option>`).join("");
  typeFilter.value = state.filters.type;
  categoryFilter.value = state.filters.category;
}

function filteredIdeas() {
  return state.ideas.filter(idea => {
    const haystack = [
      idea.title,
      idea.url,
      idea.note,
      idea.author,
      idea.source,
      ...(idea.categories || [])
    ].join(" ").toLowerCase();
    const matchesSearch = !state.filters.search || haystack.includes(state.filters.search);
    const matchesType = state.filters.type === "all" || idea.type === state.filters.type;
    const matchesCategory = state.filters.category === "all" || (idea.categories || []).includes(state.filters.category);
    return matchesSearch && matchesType && matchesCategory;
  });
}

function renderCard(idea) {
  const node = template.content.firstElementChild.cloneNode(true);
  const media = node.querySelector(".card-media");
  node.querySelector(".source-pill").textContent = idea.source || sourceLabel(idea.type);
  node.querySelector(".film-date").textContent = `Saved ${formatSavedDate(idea)}`;
  node.querySelector("h3").textContent = idea.title || "Untitled idea";
  node.querySelector(".card-note").textContent = idea.note || "";
  node.querySelector(".card-note").style.display = idea.note ? "block" : "none";
  node.querySelector(".card-url").href = idea.url || "#";
  node.querySelector(".card-url").style.display = idea.url ? "inline-flex" : "none";

  if (idea.thumbnail) {
    media.innerHTML = `<img src="${escapeAttr(idea.thumbnail)}" alt="">`;
  } else {
    media.innerHTML = fallbackPreview(idea);
  }

  const categoryRow = node.querySelector(".category-row");
  categoryRow.innerHTML = (idea.categories || []).map(category => `<span class="category-pill">${escapeHtml(category)}</span>`).join("");
  categoryRow.style.display = idea.categories?.length ? "flex" : "none";

  const actions = document.createElement("div");
  actions.className = "card-actions";
  actions.innerHTML = `
    <button class="ghost-button edit-button" type="button">Edit</button>
    <button class="ghost-button danger delete-button" type="button">Delete</button>
  `;
  node.querySelector(".card-body").appendChild(actions);
  actions.querySelector(".edit-button").addEventListener("click", () => openEditModal(idea));
  actions.querySelector(".delete-button").addEventListener("click", () => removeIdea(idea.id));
  return node;
}

function fallbackPreview(idea) {
  const title = escapeHtml(idea.title || "Saved idea");
  if (idea.type === "tweet") {
    return `<div class="tweet-preview"><div class="tweet-box"><strong>${escapeHtml(idea.author || "X post")}</strong><p>${title}</p><small>${escapeHtml(idea.url || "")}</small></div></div>`;
  }
  if (idea.type === "instagram") {
    return `<div class="insta-preview"><strong>Instagram</strong><h3>${title}</h3><p>${escapeHtml(idea.author || "Visual reference")}</p></div>`;
  }
  if (idea.type === "article") {
    return `<div class="article-preview"><strong>Article</strong><h3>${title}</h3><p>${escapeHtml(hostname(idea.url))}</p></div>`;
  }
  return `<div class="fallback-preview"><strong>${escapeHtml(sourceLabel(idea.type))}</strong><h3>${title}</h3></div>`;
}

function openEditModal(idea) {
  const modal = document.querySelector("#profile-modal");
  modal.classList.add("open");
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h2>Edit idea</h2>
        <button class="icon-button" id="close-modal" aria-label="Close">×</button>
      </div>
      <form id="edit-form">
        <div class="field"><label>Title</label><input name="title" value="${escapeAttr(idea.title || "")}"></div>
        <div class="field"><label>Categories</label><input name="categories" value="${escapeAttr((idea.categories || []).join(", "))}"></div>
        <div class="field"><label>Saved date</label><input type="date" value="${escapeAttr(savedDateValue(idea))}" disabled></div>
        <div class="field"><label>Notes</label><textarea name="note">${escapeHtml(idea.note || "")}</textarea></div>
        <button class="button accent" type="submit">Save changes</button>
      </form>
    </div>
  `;
  document.querySelector("#close-modal").addEventListener("click", closeModal);
  document.querySelector("#edit-form").addEventListener("submit", async event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await updateDoc(doc(db, "ideas", idea.id), {
      title: clean(data.get("title")),
      categories: clean(data.get("categories")).split(",").map(item => item.trim()).filter(Boolean),
      note: clean(data.get("note")),
      updatedAt: serverTimestamp()
    });
    closeModal();
    toast("Idea updated.");
  });
}

async function removeIdea(id) {
  const confirmed = confirm("Delete this idea from the shared library?");
  if (!confirmed) return;
  await deleteDoc(doc(db, "ideas", id));
  toast("Idea deleted.");
}

async function suggestTitleForForm() {
  const form = document.querySelector("#idea-form");
  const button = document.querySelector("#suggest-title");
  const titleInput = document.querySelector("#title");
  const data = new FormData(form);
  const context = {
    url: clean(data.get("url")),
    currentTitle: clean(data.get("title")),
    type: detectType(clean(data.get("url")), data.get("type")),
    categories: clean(data.get("categories")),
    note: clean(data.get("note"))
  };

  if (!context.url && !context.note && !context.currentTitle) {
    toast("Add a link or note first.");
    return;
  }

  const settings = getAiSettings();
  if (!settings.endpoint) {
    openAiSettingsModal();
    toast("Add your AI endpoint first.");
    return;
  }

  button.disabled = true;
  button.textContent = "Thinking...";

  try {
    const title = await requestBetterTitle(context, settings);
    titleInput.value = title;
    toast("Suggested a better title.");
  } catch (error) {
    toast(`Title suggestion failed: ${error.message}`);
  } finally {
    button.disabled = false;
    button.textContent = "Suggest";
  }
}

async function requestBetterTitle(context, settings) {
  if (settings.endpoint === "/api/suggest-title") {
    const response = await fetch(settings.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ context })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || response.statusText);
    const title = clean(result.title || "");
    if (!title) throw new Error("The model did not return a title.");
    return title.replace(/^["']|["']$/g, "").slice(0, 100);
  }

  const prompt = `Suggest one concise, high-signal title for this saved video idea.

Return only the title. No quotes. No explanation.

Type: ${context.type}
URL: ${context.url || "None"}
Current title: ${context.currentTitle || "None"}
Categories: ${context.categories || "None"}
Notes or reaction: ${context.note || "None"}

The title should be clear, useful for a creative team scanning a visual idea library, and under 80 characters.`;

  const response = await fetch(settings.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(settings.apiKey ? { "Authorization": `Bearer ${settings.apiKey}` } : {}),
      ...(settings.siteUrl ? { "HTTP-Referer": settings.siteUrl } : {}),
      ...(settings.appName ? { "X-Title": settings.appName } : {})
    },
    body: JSON.stringify({
      model: settings.model,
      messages: [
        {
          role: "system",
          content: "You write sharp, compact titles for saved video ideas."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.35,
      max_tokens: 40
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text.slice(0, 160) || response.statusText);
  }

  const result = await response.json();
  const title = clean(result.choices?.[0]?.message?.content || result.output_text || "");
  if (!title) throw new Error("The model did not return a title.");
  return title.replace(/^["']|["']$/g, "").slice(0, 100);
}

function openAiSettingsModal() {
  const settings = getAiSettings();
  const modal = document.querySelector("#profile-modal");
  modal.classList.add("open");
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h2>AI title setup</h2>
        <button class="icon-button" id="close-modal" aria-label="Close">×</button>
      </div>
      <p style="color: var(--muted); line-height: 1.6;">The safest option is the local private endpoint, which keeps the API key out of the browser.</p>
      <form id="ai-settings-form">
        <div class="field">
          <label>API endpoint</label>
          <input name="endpoint" value="${escapeAttr(settings.endpoint)}" placeholder="/api/suggest-title">
        </div>
        <div class="field">
          <label>Model</label>
          <input name="model" value="${escapeAttr(settings.model)}" placeholder="Provider model name">
        </div>
        <div class="field">
          <label>API key</label>
          <input name="apiKey" type="password" value="${escapeAttr(settings.apiKey)}" placeholder="Paste your API key">
        </div>
        <button class="button accent" type="submit">Save AI settings</button>
      </form>
    </div>
  `;
  document.querySelector("#close-modal").addEventListener("click", closeModal);
  document.querySelector("#ai-settings-form").addEventListener("submit", event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const nextSettings = {
      endpoint: clean(data.get("endpoint")),
      model: clean(data.get("model")),
      apiKey: clean(data.get("apiKey")),
      siteUrl: window.location.origin,
      appName: "SharedSpace"
    };
    localStorage.setItem("sharedspace.aiSettings", JSON.stringify(nextSettings));
    closeModal();
    toast("AI settings saved.");
  });
}

function getAiSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem("sharedspace.aiSettings") || "{}");
    return {
      endpoint: saved.endpoint || "/api/suggest-title",
      model: saved.model || "",
      apiKey: saved.apiKey || "",
      siteUrl: saved.siteUrl || window.location.origin,
      appName: saved.appName || "SharedSpace"
    };
  } catch {
    return {
      endpoint: "/api/suggest-title",
      model: "",
      apiKey: "",
      siteUrl: window.location.origin,
      appName: "SharedSpace"
    };
  }
}

function openProfileModal() {
  const token = state.profile?.agentToken || "";
  const skill = `SharedSpace agent skill

Purpose:
Use this Firebase-backed second brain to read, create, update, and organize video ideas for the team.

Firebase project:
- projectId: sharedspace-6ac5c
- authDomain: sharedspace-6ac5c.firebaseapp.com
- storageBucket: sharedspace-6ac5c.firebasestorage.app

Access token:
${token}

Data model:
- Collection: ideas
- Fields: title, url, type, source, author, thumbnail, note, categories, savedDate, ownerId, ownerName, createdAt, updatedAt
- Categories are user-defined only. Do not invent default categories unless asked.
- savedDate is automatic and uses YYYY-MM-DD.

Before operating:
- Validate this token by checking agentTokens/{token}.
- If the token document is missing, stop.
- Use Firebase Authentication if your runtime has it available. Otherwise ask the human to provide an approved Firebase service path before touching data.

Allowed operations:
- Read ideas from the ideas collection.
- Create new ideas with the fields above.
- Update title, note, categories, thumbnail, source metadata, and URL when requested.
- Delete only when the human explicitly asks.

Agent behavior:
- Read ideas before creating duplicates.
- Preserve rich visual metadata when saving links.
- Use categories only when the human gives them or asks you to infer them.
- Never read or modify the library unless you have this token.
- Treat the token as private.`;

  const modal = document.querySelector("#profile-modal");
  modal.classList.add("open");
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h2>Agent skill</h2>
        <button class="icon-button" id="close-modal" aria-label="Close">×</button>
      </div>
      <p style="color: var(--muted); line-height: 1.6;">Copy this block into Codex, Claude Code, or another trusted agent when you want it to work with the idea library.</p>
      <textarea class="skill-block" id="skill-block" readonly>${escapeHtml(skill)}</textarea>
      <button class="button accent" id="copy-skill" type="button" style="margin-top: 12px;">${icons.copy} Copy skill</button>
    </div>
  `;
  document.querySelector("#close-modal").addEventListener("click", closeModal);
  document.querySelector("#copy-skill").addEventListener("click", async () => {
    await navigator.clipboard.writeText(skill);
    toast("Agent skill copied.");
  });
}

function closeModal() {
  const modal = document.querySelector("#profile-modal");
  modal.classList.remove("open");
  modal.innerHTML = "";
}

function detectType(url, selected) {
  if (selected && selected !== "auto") return selected;
  const value = url.toLowerCase();
  if (!value) return "idea";
  if (value.includes("youtube.com") || value.includes("youtu.be")) return "youtube";
  if (value.includes("twitter.com") || value.includes("x.com")) return "tweet";
  if (value.includes("instagram.com")) return "instagram";
  return "article";
}

function getYouTubeId(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtu.be")) return parsed.pathname.slice(1);
    return parsed.searchParams.get("v") || parsed.pathname.split("/").filter(Boolean).pop();
  } catch {
    return "";
  }
}

function parseTweet(url) {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/").filter(Boolean);
    const author = parts[0] ? `@${parts[0]}` : "X post";
    return {
      author,
      title: `Saved post from ${author}`
    };
  } catch {
    return { author: "X post", title: "Saved X post" };
  }
}

function instagramAuthor(url) {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/").filter(Boolean);
    return parts[0] && !["p", "reel", "tv"].includes(parts[0]) ? `@${parts[0]}` : "";
  } catch {
    return "";
  }
}

function generatedSocialThumbnail({ platform, title, author, url, theme }) {
  const width = 900;
  const height = 560;
  const palette = theme === "instagram"
    ? {
      bg: "#f5ece4",
      panel: "#fffdf8",
      ink: "#161412",
      muted: "#6f6257",
      accent: "#b44459",
      accentTwo: "#385b8f",
      accentThree: "#a26921"
    }
    : {
      bg: "#eef6f7",
      panel: "#ffffff",
      ink: "#121718",
      muted: "#5d6b70",
      accent: "#171717",
      accentTwo: "#0d766e",
      accentThree: "#385b8f"
    };
  const safeTitle = truncate(title || `${platform} reference`, 96);
  const safeAuthor = truncate(author || platform, 42);
  const safeHost = truncate(hostname(url) || url || "Saved reference", 48);
  const lines = wrapText(safeTitle, 33, 4);
  const lineTspans = lines.map((line, index) => (
    `<tspan x="92" y="${238 + index * 54}">${escapeSvg(line)}</tspan>`
  )).join("");
  const monogram = platform === "Instagram" ? "IG" : "X";
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <linearGradient id="wash" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="${palette.bg}"/>
          <stop offset="0.55" stop-color="#fffaf2"/>
          <stop offset="1" stop-color="${palette.accentTwo}" stop-opacity="0.24"/>
        </linearGradient>
        <linearGradient id="mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="${palette.accent}"/>
          <stop offset="0.62" stop-color="${palette.accentTwo}"/>
          <stop offset="1" stop-color="${palette.accentThree}"/>
        </linearGradient>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="20" stdDeviation="22" flood-color="#2b261b" flood-opacity="0.18"/>
        </filter>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#wash)"/>
      <rect x="54" y="54" width="792" height="452" rx="28" fill="${palette.panel}" filter="url(#shadow)"/>
      <rect x="92" y="92" width="74" height="74" rx="20" fill="url(#mark)"/>
      <text x="129" y="139" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="26" font-weight="800" fill="#ffffff">${monogram}</text>
      <text x="186" y="122" font-family="Inter, Arial, sans-serif" font-size="25" font-weight="800" fill="${palette.ink}">${escapeSvg(platform)}</text>
      <text x="186" y="157" font-family="Inter, Arial, sans-serif" font-size="24" font-weight="600" fill="${palette.muted}">${escapeSvg(safeAuthor)}</text>
      <text font-family="Inter, Arial, sans-serif" font-size="42" font-weight="800" fill="${palette.ink}" letter-spacing="0">${lineTspans}</text>
      <rect x="92" y="436" width="716" height="1" fill="#ded9cc"/>
      <text x="92" y="474" font-family="Inter, Arial, sans-serif" font-size="22" font-weight="700" fill="${palette.muted}">${escapeSvg(safeHost)}</text>
    </svg>
  `;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function wrapText(value, maxChars, maxLines) {
  const words = String(value || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  words.forEach(word => {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  });
  if (current) lines.push(current);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = `${lines[maxLines - 1].replace(/\.+$/, "")}...`;
  }
  return lines.length ? lines : ["Saved reference"];
}

function truncate(value, maxLength) {
  const text = String(value || "");
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function escapeSvg(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function sourceLabel(type) {
  const labels = {
    youtube: "YouTube",
    tweet: "X",
    instagram: "Instagram",
    article: "Article",
    screenshot: "Screenshot",
    idea: "Idea",
    all: "All"
  };
  return labels[type] || "Reference";
}

function titleFromUrl(url) {
  const host = hostname(url);
  return host ? `Reference from ${host}` : "Saved reference";
}

function hostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function formatDate(value) {
  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function formatSavedDate(idea) {
  const savedDate = savedDateValue(idea);
  if (savedDate) return formatDate(savedDate);
  if (idea.createdAt?.toDate) {
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(idea.createdAt.toDate());
  }
  return "today";
}

function savedDateValue(idea) {
  if (idea.savedDate) return idea.savedDate;
  if (idea.createdAt?.toDate) return idea.createdAt.toDate().toISOString().slice(0, 10);
  return "";
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function clean(value) {
  return String(value || "").trim();
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function toast(message) {
  const toastNode = document.querySelector("#toast");
  if (!toastNode) return;
  toastNode.textContent = message;
  toastNode.classList.add("show");
  setTimeout(() => toastNode.classList.remove("show"), 3200);
}
