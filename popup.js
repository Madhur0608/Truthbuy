// popup.js — Amazon + External Logic
const BACKEND_URL = "https://truthbuy.onrender.com/analyze";

// --- DOM HELPERS ---
function getEl(id) { return document.getElementById(id); }

function getCacheKey(productData) {
  if (productData.asin && productData.asin !== "unknown") {
    return "tb_" + productData.asin;
  }
  try { return "tb_" + new URL(productData.url).pathname; } 
  catch { return "tb_" + productData.url; }
}

function toArray(input) {
  if (!input) return [];
  if (Array.isArray(input)) return input;
  if (typeof input === 'string') {
    return input.split(/,|\n/).map(s => s.trim()).filter(s => s.length > 0);
  }
  return [String(input)];
}

// --- UI STATES ---
function showResult() {
  getEl('loading-view').classList.add('hidden');
  getEl('error-view').classList.add('hidden');
  getEl('result').classList.remove('hidden');
}

function showError(msg) {
  getEl('loading-view').classList.add('hidden');
  getEl('result').classList.add('hidden');
  getEl('error-view').classList.remove('hidden');
  getEl('error-msg').textContent = msg;
  getEl('status').textContent = "Failed";
}

// --- LOGIC ENGINES ---
function analyzeIssue(text, providedCat, providedSev) {
  const t = text.toLowerCase();
  if (t.includes("read more") || t.length < 4) return { cat: "Ignore", sev: "None", source: "System" };

  let cat = providedCat || "Quality";
  let sev = providedSev || "Moderate";
  let source = "Reported";

  // Identify Minor/Specs issues (Blue/Grey)
  if (t.match(/layout|language|backlight|indicator|usb|compatible|version|macos|windows|support|stand|design|thin/)) {
    sev = "Minor"; source = "Note"; if (!providedCat || providedCat === "General") cat = "Specs";
  }
  // Identify Critical Risks (Red)
  if (t.match(/fake|bot|manipulated|future date|conflict|scam|fraud/)) { cat = "Integrity"; sev = "Critical"; source = "Detected"; }
  else if (t.match(/explode|fire|heat|danger|shock|spark|smoke/)) { cat = "Safety"; sev = "Critical"; }
  else if (t.match(/dead|broken|used|refurbished|scratch|defect|fail/)) { cat = "Condition"; sev = "High"; }
  else if (t.match(/return|warranty|policy|refund/)) { cat = "Policy"; source = "Fact"; sev = "Minor"; }
  else if (t.match(/connection|sync|bluetooth|wifi|lag/)) { cat = "Connectivity"; }

  return { cat, sev, source };
}

function getSmartUseCases(productData) {
  const title = (productData.title || "").toLowerCase();
  let priceVal = 0;
  if (productData.price) priceVal = parseFloat(productData.price.replace(/[^0-9.]/g, ''));

  // Fix for "Mouse for Laptop" confusion
  const isAccessory = title.match(/mouse|keyboard|case|cover|guard|cable|adapter|charger|stand/);
  const isMainTech = title.match(/laptop|macbook|phone|mobile|tablet|camera|monitor|console/);

  if (title.match(/mouse|keyboard/)) {
    return { best: ["Daily Office Work", "Students", "Casual Browsing"], not: ["Competitive Gaming", "Glass Surfaces"] };
  }
  if (priceVal > 300 || (isMainTech && !isAccessory)) {
    return { best: ["Performance Tasks", "High-End Workflows", "Long-term Use"], not: ["Budget Seekers", "Rough Usage"] };
  }
  return { best: ["Casual Daily Use", "Value for Money", "Basic Tasks"], not: ["Professional Workloads", "Heavy Multitasking"] };
}

// --- RENDERERS ---

// Render Reddit/News
function renderExternalSignals(signals) {
  const container = getEl('external-list');
  const section = getEl('external-section');
  container.innerHTML = '';

  if (!signals || ( (!signals.reddit || !signals.reddit.length) && (!signals.news || !signals.news.length) )) {
    section.classList.add('hidden');
    return;
  }

  section.classList.remove('hidden');
  const fragment = document.createDocumentFragment();

  if (signals.reddit) {
    signals.reddit.slice(0, 2).forEach(post => {
      const sentimentClass = post.sentiment === 'Positive' ? 'sent-pos' : (post.sentiment === 'Negative' ? 'sent-neg' : 'sent-neu');
      const a = document.createElement('a');
      a.className = 'signal-card sc-reddit';
      a.href = post.link;
      a.target = '_blank';
      a.innerHTML = `
        <div class="sig-top">
          <span class="sig-source"><span class="icon-reddit">R</span> Reddit</span>
          ${post.sentiment ? `<span class="sig-sentiment ${sentimentClass}">${post.sentiment}</span>` : ''}
        </div>
        <div class="sig-title">${post.title}</div>
      `;
      fragment.appendChild(a);
    });
  }

  if (signals.news) {
    signals.news.slice(0, 2).forEach(news => {
      const a = document.createElement('a');
      a.className = 'signal-card sc-news';
      a.href = news.link;
      a.target = '_blank';
      a.innerHTML = `
        <div class="sig-top">
          <span class="sig-source"><span class="icon-news">N</span> ${news.source || "News"}</span>
        </div>
        <div class="sig-title">${news.title}</div>
      `;
      fragment.appendChild(a);
    });
  }
  container.appendChild(fragment);
}

function renderBreakdown(scores, mainScore) {
  const container = getEl('score-breakdown');
  container.innerHTML = '';
  let data = scores || { "Reliability": parseFloat(mainScore)||5, "Satisfaction": 6.5, "Value": parseFloat(mainScore)||5 };
  
  const fragment = document.createDocumentFragment();
  Object.entries(data).forEach(([key, val]) => {
    let num = parseFloat(val);
    if (num > 10) num /= 10;
    num = Math.round(num * 10) / 10;
    let color = num >= 7.0 ? 'bg-green' : (num >= 5.0 ? 'bg-orange' : 'bg-red');

    const div = document.createElement('div');
    div.className = "breakdown-item";
    div.innerHTML = `<span class="bd-label">${key}</span><div class="bar-container"><div class="bar-fill ${color}" style="width:${num*10}%"></div></div><span class="score-num">${num}</span>`;
    fragment.appendChild(div);
  });
  container.appendChild(fragment);
}

function renderUseCases(suitability, productData) {
  const bestList = getEl('best-for');
  const notList = getEl('not-for');
  bestList.innerHTML = ''; notList.innerHTML = '';

  let data = suitability;
  if (!data || !data.best || data.best.length === 0) data = getSmartUseCases(productData);

  const appendList = (target, items) => {
    const frag = document.createDocumentFragment();
    toArray(items).forEach(t => { const li = document.createElement('li'); li.className = "uc-item"; li.textContent = t; frag.appendChild(li); });
    target.appendChild(frag);
  };
  appendList(bestList, data.best); appendList(notList, data.not);
}

function renderRedFlags(flags) {
  const container = getEl('red-flags-list');
  container.innerHTML = '';
  
  if (!flags || flags.length === 0) {
    container.innerHTML = '<div class="empty-state">✅ No critical issues found.</div>';
    return 0; 
  }

  const groups = {};
  let strictCriticalCount = 0; 
  const list = Array.isArray(flags) ? flags : [flags];

  list.forEach(item => {
    const isObj = typeof item === 'object';
    const rawText = isObj ? item.issue : item;
    const rawCat = isObj ? item.category : "General";
    const { cat, sev, source } = analyzeIssue(rawText, rawCat, isObj ? item.severity : null);
    if (cat === "Ignore") return; 

    if (!groups[cat]) groups[cat] = { cat, sev, source, issues: [] };

    if (sev.toLowerCase() === 'critical') {
      groups[cat].sev = 'Critical'; groups[cat].source = 'Detected';
      if (cat === "Integrity" || cat === "Safety") strictCriticalCount++;
    } else if (sev.toLowerCase() === 'high' || sev.toLowerCase() === 'moderate') {
       if (groups[cat].sev === 'Minor') groups[cat].sev = 'Moderate';
    }
    groups[cat].issues.push(rawText);
  });

  const fragment = document.createDocumentFragment();
  Object.values(groups).forEach(group => {
    let icon = "⚠️";
    if (group.cat === "Integrity") icon = "🤖";
    else if (group.cat === "Policy") icon = "📜";
    else if (group.cat === "Safety") icon = "🔥";
    else if (group.cat === "Specs" || group.cat === "Missing Info") icon = "ℹ️";
    else if (group.cat === "Condition") icon = "♻️";

    let cardClass = 'card-min'; let badgeClass = 'source-tag-min';
    if (group.sev.toLowerCase() === 'critical') { cardClass = 'card-crit'; badgeClass = 'source-tag-crit'; } 
    else if (group.sev.toLowerCase() === 'high' || group.sev.toLowerCase() === 'moderate') { cardClass = 'card-mod'; badgeClass = 'source-tag-mod'; }

    let contentHtml = group.issues.length === 1 ? `<div class="issue-text">${group.issues[0]}</div>` : `<ul class="issue-list">${group.issues.map(txt => `<li>${txt}</li>`).join('')}</ul>`;

    const div = document.createElement('div');
    div.className = `issue-card ${cardClass}`;
    div.innerHTML = `<div class="issue-header"><span class="cat-tag">${icon} ${group.cat}</span><span class="source-tag ${badgeClass}">${group.source}</span></div>${contentHtml}`;
    fragment.appendChild(div);
  });
  container.appendChild(fragment);
  return strictCriticalCount;
}

function renderCompetitors(comps, productData) {
  const div = getEl('competitors-list');
  div.innerHTML = '';
  let list = toArray(comps);
  if (list.length === 0) {
     const titleWords = productData.title.split(' ').slice(0, 3).join(' ');
     list = [{ text: `Alternatives for ${titleWords}`, query: `${titleWords} alternatives` }, { text: `Top Rated in ${productData.category || "Category"}`, query: `best rated ${productData.category || titleWords}` }];
  } else list = list.map(c => ({ text: c, query: c }));

  const fragment = document.createDocumentFragment();
  list.forEach(item => {
    const btn = document.createElement('button');
    btn.className = 'comp-btn';
    btn.textContent = item.text;
    btn.onclick = () => {
        const domain = productData.url.includes('.in') ? 'amazon.in' : 'amazon.com';
        window.open(`https://www.${domain}/s?k=${encodeURIComponent(item.query)}&s=review-rank`, '_blank');
    };
    fragment.appendChild(btn);
  });
  div.appendChild(fragment);
}

function render(analysis, productData) {
  showResult();
  getEl('status').textContent = "Analyzed";

  let s = parseFloat(analysis.reliability_score) || 5;
  if (s > 10) s /= 10;
  s = Math.round(s * 10) / 10;

  const strictCriticalCount = renderRedFlags(analysis.red_flags);
  renderExternalSignals(analysis.external_signals);

  let v = (analysis.verdict || "CONSIDER").toUpperCase();
  let colorClass = 'text-orange'; let bgClass = 'bg-orange';
  
  if (strictCriticalCount > 0 || s <= 4.9) {
    v = "CAUTION"; colorClass = 'text-red'; bgClass = 'bg-red';
    if (s > 6.0) s = 6.0; 
  } else if (s >= 7.5) {
    v = "BUY"; colorClass = 'text-green'; bgClass = 'bg-green';
  } else {
    v = "CONSIDER"; colorClass = 'text-orange'; bgClass = 'bg-orange';
  }

  const scoreEl = getEl('score-val'); scoreEl.textContent = s; scoreEl.className = `score-val ${colorClass}`;
  const badgeEl = getEl('verdict-badge'); badgeEl.textContent = v; badgeEl.className = `verdict-badge ${bgClass} ${colorClass}`;

  renderBreakdown(analysis.score_breakdown, s);
  renderUseCases(analysis.suitability, productData);
  renderCompetitors(analysis.competitors, productData);
  getEl('details-content').textContent = analysis.detailed_analysis || analysis.summary;
}

// --- INIT & NETWORK ---
async function callBackend(productData) {
  try {
    const res = await fetch(BACKEND_URL, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productData })
    });
    if (!res.ok) throw new Error("Backend Error: " + res.status);
    
    const json = await res.json();
    if (!json.success) throw new Error(json.error || "Analysis failed");
    
    const key = getCacheKey(productData);
    chrome.storage.local.set({ [key]: { timestamp: Date.now(), analysis: json.analysis, productData } });
    render(json.analysis, productData);
  } catch (err) { showError(err.message); }
}

document.addEventListener("DOMContentLoaded", () => {
  getEl('retry-btn').onclick = () => location.reload();
  getEl('status').textContent = "Scanning...";
  
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    const tab = tabs[0];
    if (!tab || !tab.url.includes('amazon')) { showError("Please open an Amazon product page."); return; }
    
    chrome.tabs.sendMessage(tab.id, { type: "GET_PRODUCT_DATA" }, res => {
      if (chrome.runtime.lastError || !res || !res.success) { showError("Could not read page. Try refreshing."); return; }
      
      const productData = res.data;
      const key = getCacheKey(productData);
      
      chrome.storage.local.get([key], r => {
        if (r[key] && (Date.now() - r[key].timestamp < 86400000)) {
          render(r[key].analysis, r[key].productData);
        } else {
          callBackend(productData);
        }
      });
    });
  });
});