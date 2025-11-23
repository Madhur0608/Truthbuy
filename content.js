// content.js — Robust Scraper

// Helper: Try multiple selectors until one works
function getTextFromSelectors(selectors, root = document) {
  for (const sel of selectors) {
    const el = root.querySelector(sel);
    if (el && el.innerText.trim()) return el.innerText.trim();
  }
  return null;
}

// Extract Amazon Standard Identification Number (ASIN) for reliable caching
function getASIN() {
  const hiddenInput = document.querySelector('input[name="ASIN"]');
  if (hiddenInput) return hiddenInput.value;
  
  const urlMatch = location.href.match(/\/dp\/([A-Z0-9]{10})/);
  return urlMatch ? urlMatch[1] : null;
}

function scrapeProduct() {
  const asin = getASIN();
  
  // Title Fallbacks
  const title = getTextFromSelectors([
    "#productTitle", 
    "#title", 
    "h1#title", 
    ".product-title-word-break"
  ]) || document.title;
  
  // Price Fallbacks
  const price = getTextFromSelectors([
    ".a-price .a-offscreen", 
    "#corePriceDisplay_desktop_feature_div .a-price-whole",
    "#priceblock_ourprice",
    "#priceblock_dealprice",
    ".apexPriceToPay .a-offscreen"
  ]);

  // Return Policy Fallbacks
  const returnPolicy = getTextFromSelectors([
    "#dcp-return-policy-label",
    "#return-policy-tag",
    ".return-policy-text-block",
    "#RETURNS_POLICY"
  ]) || "Policy not found";

  // Technical Details (Try multiple table types)
  let specs = {};
  const tableRows = document.querySelectorAll("#productDetails_techSpec_section_1 tr, .prodDetTable tr, #productDetails_db_sections tr");
  
  tableRows.forEach(row => {
    const key = getTextFromSelectors(["th", ".a-color-secondary"], row);
    const val = getTextFromSelectors(["td", ".a-size-base"], row);
    // Clean keys to be JSON friendly
    if(key && val) specs[key.replace(/\s+/g, '_').replace(/:/g, '')] = val;
  });

  const rating = getTextFromSelectors(["span[data-hook='rating-out-of-text']", ".a-icon-alt"]) || "0";
  const totalReviews = getTextFromSelectors(["#acrCustomerReviewText", "span[data-hook='total-review-count']"]) || "0";

  const reviews = [];
  document.querySelectorAll("[data-hook='review']").forEach((rev, i) => {
    if (i < 10) { 
      reviews.push({
        title: getTextFromSelectors(["[data-hook='review-title']", ".review-title"], rev),
        body: getTextFromSelectors(["[data-hook='review-body']", ".review-text-content"], rev),
        stars: getTextFromSelectors(["[data-hook='review-star-rating']", ".a-icon-alt"], rev),
        date: getTextFromSelectors(["[data-hook='review-date']"], rev)
      });
    }
  });

  return {
    url: location.href,
    asin: asin || "unknown",
    title,
    price: price || "",
    returnPolicy,
    specs,
    rating,
    totalReviews,
    reviews
  };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "GET_PRODUCT_DATA") {
    sendResponse({ success: true, data: scrapeProduct() });
  }
});