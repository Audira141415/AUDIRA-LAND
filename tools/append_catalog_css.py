import os

css_path = os.path.join(os.path.dirname(__file__), "..", "web", "src", "ui", "styles.css")
with open(css_path, "r", encoding="utf-8") as f:
    css = f.read()

extra_styles = """
/* =============================================================================
   TAMBAHAN KATALOG LENGKAP 36 BANGUNAN NETIZENIA & NUSANTARA
   ============================================================================= */
.modal-card.modal-large {
    max-width: 580px;
    width: 100%;
}

.category-tabs {
    display: flex;
    gap: 6px;
    overflow-x: auto;
    padding-bottom: 4px;
    margin-bottom: 6px;
    scrollbar-width: thin;
}

.category-tabs::-webkit-scrollbar {
    height: 4px;
}

.category-tabs::-webkit-scrollbar-thumb {
    background: var(--ink);
    border-radius: var(--radius-full);
}

.cat-tab {
    background: var(--paper);
    border: 1.5px solid var(--ink);
    box-shadow: 1.5px 1.5px 0px var(--ink);
    border-radius: var(--radius-full);
    padding: 5px 12px;
    font-size: 11px;
    font-weight: 800;
    color: var(--ink);
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.1s ease;
}

.cat-tab:active {
    transform: translate(1px, 1px);
    box-shadow: none;
}

.cat-tab.active {
    background: var(--wood);
    color: var(--paper);
    border-color: var(--ink);
    box-shadow: 2px 2px 0px var(--ink);
}

.catalog-grid-scroll {
    max-height: 330px;
    overflow-y: auto;
    padding-right: 4px;
    scrollbar-width: thin;
}

.catalog-grid-scroll::-webkit-scrollbar {
    width: 6px;
}

.catalog-grid-scroll::-webkit-scrollbar-thumb {
    background: var(--wood);
    border-radius: var(--radius-full);
}

.meta-tag.cost {
    background: #FFF1D2;
    color: #9C5200;
    border-color: #D49428;
    font-weight: 900;
}

.cost-val.highlight {
    color: var(--wood);
    font-weight: 900;
    font-size: 14px;
}
"""

if ".modal-card.modal-large" not in css:
    with open(css_path, "a", encoding="utf-8") as f:
        f.write("\n" + extra_styles)
    print("Added extra styles to styles.css successfully!")
else:
    print("Styles already present.")


