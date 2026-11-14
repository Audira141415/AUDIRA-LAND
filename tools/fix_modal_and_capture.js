const fs = require('fs');
const path = require('path');

// 1. Fix auth_modal.js show/hide
const authPath = path.resolve(__dirname, '../web/src/ui/auth_modal.js');
let authContent = fs.readFileSync(authPath, 'utf8');

authContent = authContent.replace(
    `    show(tab = 'instagram') {
        this.activeTab = playerState.state.isRegistered && tab !== 'instagram' ? 'ktp' : tab;
        this.render();
        this.modalEl.classList.add('visible');
    }

    hide() {
        this.modalEl.classList.remove('visible');
    }`,
    `    show(tab = 'instagram') {
        this.activeTab = tab;
        this.render();
        this.modalEl.classList.add('active', 'visible');
        this.modalEl.style.display = 'flex';
    }

    hide() {
        this.modalEl.classList.remove('active', 'visible');
        this.modalEl.style.display = 'none';
    }`
);

fs.writeFileSync(authPath, authContent, 'utf8');
console.log('[AuthModal] Fixed show/hide display style');

// 2. Fix styles.css
const cssPath = path.resolve(__dirname, '../web/src/ui/styles.css');
let cssContent = fs.readFileSync(cssPath, 'utf8');

cssContent = cssContent.replace(
    `.modal-backdrop.active {
    display: flex;`,
    `.modal-backdrop.active,
.modal-backdrop.visible {
    display: flex !important;`
);

fs.writeFileSync(cssPath, cssContent, 'utf8');
console.log('[CSS] Fixed modal backdrop visibility');

