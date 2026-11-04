// Preserve native values and change events for the workbench's forms; present
// their choices in the same dark, keyboard-accessible menu as the workspace.
export function enhanceSelects(root = document) {
 const controls = new Map();
 let serial = 0, scheduled = false;
 function attach(select) {
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'beat-select-trigger'; button.setAttribute('role', 'combobox');
  button.setAttribute('aria-haspopup', 'listbox'); button.setAttribute('aria-expanded', 'false');
  const label = document.createElement('span'); button.append(label);
  const popup = document.createElement('div'); popup.className = 'beat-select-menu';
  popup.id = `beat-select-${++serial}`; popup.setAttribute('role', 'listbox'); popup.setAttribute('popover', 'auto');
  button.setAttribute('aria-controls', popup.id);
  select.hidden = true; select.setAttribute('aria-hidden', 'true'); select.tabIndex = -1;
  select.after(button); document.body.append(popup);
  let active = -1, signature = '', typed = '', typedAt = 0;
  const options = () => [...select.options];
  const isOpen = () => popup.matches(':popover-open');
  function highlight(index) {
   active = index;
   [...popup.children].forEach((item, i) => item.classList.toggle('highlighted', i === active));
   const item = popup.children[active];
   if(item) { button.setAttribute('aria-activedescendant', item.id); item.scrollIntoView({block:'nearest'}); }
  }
  function close() { if(isOpen()) popup.hidePopover(); }
  function position() {
   const box = button.getBoundingClientRect();
   const width = Math.min(box.width, innerWidth - 24);
   const below = innerHeight - box.bottom - 12;
   const above = box.top - 12;
   const up = below < Math.min(popup.scrollHeight, 240) && above > below;
   popup.style.width = `${width}px`; popup.style.left = `${Math.max(12, Math.min(box.left, innerWidth-width-12))}px`;
   popup.style.maxHeight = `${Math.max(60, Math.min(320, up ? above - 6 : below - 6))}px`;
   popup.style.top = up ? 'auto' : `${box.bottom+6}px`;
   popup.style.bottom = up ? `${innerHeight-box.top+6}px` : 'auto';
  }
  function open() {
   sync(); if(button.disabled || !options().length || isOpen()) return;
   popup.showPopover(); position(); button.setAttribute('aria-expanded','true');
   highlight(select.selectedIndex >= 0 ? select.selectedIndex : options().findIndex(o=>!o.disabled));
  }
  function choose(index) {
   const option = options()[index]; if(!option || option.disabled) return;
   select.value = option.value; sync(); close(); button.focus();
   select.dispatchEvent(new Event('change',{bubbles:true}));
  }
  function sync() {
   const name = select.getAttribute('aria-label') || [...select.labels].map(l => [...l.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE).map(n=>n.textContent).join('').trim()).join(' ') || select.id;
   button.setAttribute('aria-label',name); popup.setAttribute('aria-label',name);
   if(button.disabled !== select.disabled) button.disabled = select.disabled;
   const nextLabel = select.selectedOptions[0]?.textContent || '';
   if(label.textContent !== nextLabel) label.textContent = nextLabel;
   const next = JSON.stringify(options().map(o=>[o.value,o.textContent,o.disabled,o.selected]));
   if(next !== signature) {
    signature = next; popup.replaceChildren();
    options().forEach((option, index) => {
     const item = document.createElement('div'); item.id = `${popup.id}-${index}`;
     item.setAttribute('role','option'); item.setAttribute('aria-selected',String(option.selected));
     item.setAttribute('aria-disabled',String(option.disabled)); item.textContent = option.textContent;
     item.addEventListener('pointermove',()=>{if(!option.disabled)highlight(index)});
     item.addEventListener('click',()=>choose(index)); popup.append(item);
    });
   }
   if(button.disabled) close();
  }
  button.addEventListener('click',()=>isOpen()?close():open());
  button.addEventListener('keydown',event=>{
   if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)) {
    event.preventDefault(); open(); const all = options(); const enabled = all.map((o,i)=>o.disabled?-1:i).filter(i=>i>=0);
    let next = event.key==='Home'?enabled[0]:event.key==='End'?enabled.at(-1):enabled[Math.max(0,Math.min(enabled.length-1,enabled.indexOf(active)+(event.key==='ArrowDown'?1:-1)))];
    if(next!==undefined)highlight(next);
   } else if(event.key==='Enter'||event.key===' ') {event.preventDefault(); if(isOpen())choose(active);else open();}
   else if(event.key==='Escape'||event.key==='Tab') {close();}
   else if(event.key.length===1&&!event.ctrlKey&&!event.metaKey&&!event.altKey) {
    event.preventDefault(); if(Date.now()-typedAt>700)typed=''; typed+=event.key.toLowerCase(); typedAt=Date.now();open();
    const index=options().findIndex(o=>!o.disabled&&o.textContent.toLowerCase().startsWith(typed));if(index>=0)highlight(index);
   }
  });
  popup.addEventListener('toggle',()=>{button.setAttribute('aria-expanded',String(isOpen()));if(!isOpen())button.removeAttribute('aria-activedescendant')});
  select.addEventListener('change',sync);
  controls.set(select,{button,popup,sync,close,position,isOpen}); sync();
 }
 function scan() {
  scheduled=false;
  for(const [select,control] of controls) {if(!select.isConnected){control.popup.remove();control.button.remove();controls.delete(select)}else control.sync()}
  root.querySelectorAll('select:not([multiple])').forEach(select=>{if(!controls.has(select))attach(select)});
 }
 const observer = new MutationObserver(()=>{if(!scheduled){scheduled=true;queueMicrotask(scan)}});
 // Observe source options and page replacement, not custom menu state changes.
 observer.observe(root.body ?? root,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['disabled']});
 root.addEventListener('click',event=>{const label=event.target.closest('label');if(label&&event.target===label){const control=controls.get(label.control);control?.button.focus()}});
 root.addEventListener('reset',()=>setTimeout(scan,0));
 window.addEventListener('resize',()=>{for(const c of controls.values())c.close()});
 window.addEventListener('scroll',event=>{for(const c of controls.values())if(c.isOpen()&&!c.popup.contains(event.target))c.close()},true);
 scan();
}
