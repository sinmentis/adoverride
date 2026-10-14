export function capturedBoardHtml(dark = true) {
  const columns = ['New', 'Waiting', 'Active', 'Review', 'Closed'];
  return `<!doctype html><html><head><title>Native Board layout fixture</title><style>
    * { box-sizing:border-box; }
    body { margin:0;font:12px sans-serif;background:${dark ? '#202020' : '#fff'};color:${dark ? '#eee' : '#222'};overflow:hidden; }
    .flex-row { display:flex; } .flex-column { display:flex;flex-direction:column; } .flex-grow { flex:1 1 auto; }
    .region-content { position:relative;display:flex;margin:48px 0 0 48px;height:calc(100vh - 48px); }
    .bolt-page { flex:1;display:flex;flex-direction:column;min-width:0; }
    .board-toolbar { height:186px;flex:none;padding:16px; }
    .board-scroll { display:flex;flex:1;min-height:0;min-width:0;overflow:auto; }
    .board-wrapper { display:flex;flex-direction:column;flex:1;min-width:0;padding-top:16px; }
    .kanban-board { display:flex;flex-direction:column;flex:1;min-width:1152px;padding-inline:16px; }
    .kanban-board-column-header-container { display:flex;position:sticky;top:0;margin-bottom:4px;background:inherit; }
    .kanban-board-content { display:flex;flex:1; }
    .kanban-board-column-header,.kanban-board-column { min-width:220px;max-width:350px;margin-right:4px; }
    .kanban-board-column-header { display:flex;flex:1 1 20%;height:44px;padding:16px 16px 4px;font-size:16px;align-items:center;gap:8px; }
    .kanban-board-column-header>span { flex:1;min-width:0; }
    .kanban-board-column { display:flex;flex-direction:column;flex:1 1 0;border-top:2px solid #666;padding-bottom:8px;background:${dark ? '#292929' : '#f4f4f4'}; }
    .kanban-board-column-collapse-button { width:24px;height:24px;flex:none; }
    .wit-card { margin:8px;display:flex;min-height:80px;padding:8px;border:1px solid #888;background:inherit; }
    .kanban-board-column-header.collapsed,.kanban-board-column.collapsed { flex:0 0 40px;min-width:40px;max-width:40px; }
    .kanban-board-column-header.collapsed>span { display:none; }
    .kanban-board-column.collapsed>.wit-card { display:none; }
  </style></head><body>
    <main class="region-content"><div class="bolt-page">
      <div class="board-toolbar"><input aria-label="Board filter" placeholder="Filter by keyword"><button>Board settings</button></div>
      <div class="board-scroll"><div class="board-wrapper"><div class="kanban-board">
        <div class="kanban-board-column-header-container">${columns.map((name, index) => `<span class="kanban-board-column-header${index === 0 || index === 4 ? ' collapsible' : ''}" data-fixture-column="${index}" style="flex-basis:20%">
          <span>${name}</span>${index === 0 || index === 4 ? `<button class="kanban-board-column-collapse-button" aria-label="Collapse ${name}" aria-expanded="true">-</button>` : ''}
        </span>`).join('')}</div>
        <div class="kanban-board-content">${columns.map((name, index) => `<div class="kanban-board-column" data-fixture-column="${index}">
          ${index === 1 ? '' : `<article class="wit-card boards-card" draggable="true" data-work-item-id="${101 + index}"><a href="#fixture-ticket">Sample ${name} work item</a></article>`}
        </div>`).join('')}</div>
      </div></div></div>
    </div></main>
    <script>
      for (const button of document.querySelectorAll('.kanban-board-column-collapse-button')) {
        button.addEventListener('click', () => {
          const header = button.closest('.kanban-board-column-header');
          const column = document.querySelector('.kanban-board-content>[data-fixture-column="' + header.dataset.fixtureColumn + '"]');
          const collapsed = button.getAttribute('aria-expanded') === 'true';
          button.setAttribute('aria-expanded', String(!collapsed));
          header.classList.toggle('collapsed', collapsed); column.classList.toggle('collapsed', collapsed);
          const count = document.querySelectorAll('.kanban-board-column:not(.collapsed)').length;
          document.querySelector('.kanban-board').style.minWidth = (count * 224 + (5 - count) * 44 + 32) + 'px';
        });
      }
    </script>
  </body></html>`;
}

export function loadMoreBoardHtml({ anchor = false, roleLink = false, icon = false, batches = 3, delay = 60, stalled = false } = {}) {
  return capturedBoardHtml().replace('</body>', `<script>
    document.documentElement.dataset.nativeRequests = '0';
    document.documentElement.dataset.nativeActiveRequests = '0';
    document.documentElement.dataset.nativeMaxActiveRequests = '0';
    document.documentElement.dataset.nativeStalled = ${JSON.stringify(String(stalled))};
    for (const index of [2, 4]) {
      const column = document.querySelector('.kanban-board-content>[data-fixture-column="' + index + '"]');
      const more = document.createElement(${JSON.stringify(roleLink ? 'span' : anchor ? 'a' : 'button')});
      if (${icon}) {
        const icon = document.createElement('span'); icon.textContent = '+';
        const label = document.createElement('span'); label.textContent = 'Show more items';
        more.append(icon, label);
      } else more.textContent = 'Show more items';
      more.className = 'bolt-button native-fixture-more';
      if (${roleLink}) { more.setAttribute('role', 'link'); more.tabIndex = 0; }
      if (more.tagName === 'A') more.href = '#';
      else if (more.tagName === 'BUTTON') more.type = 'button';
      let remaining = ${batches};
      let serial = 0;
      let busy = false;
      more.addEventListener('click', event => {
        event.preventDefault();
        if (busy || remaining === 0) return;
        const data = document.documentElement.dataset;
        data.nativeRequests = String(Number(data.nativeRequests) + 1);
        if (data.nativeStalled === 'true') return;
        busy = true;
        more.setAttribute('aria-disabled', 'true');
        if (more.tagName === 'BUTTON') more.disabled = true;
        column.setAttribute('aria-busy', 'true');
        data.nativeActiveRequests = String(Number(data.nativeActiveRequests) + 1);
        data.nativeMaxActiveRequests = String(Math.max(Number(data.nativeMaxActiveRequests), Number(data.nativeActiveRequests)));
        window.setTimeout(() => {
          for (let item = 0; item < 2; item++) {
            const card = document.createElement('article');
            card.className = 'wit-card boards-card';
            card.dataset.workItemId = String(1000 + index * 100 + ++serial);
            card.textContent = 'Fictional loaded work item';
            column.insertBefore(card, more);
          }
          remaining--;
          busy = false;
          column.setAttribute('aria-busy', 'false');
          data.nativeActiveRequests = String(Number(data.nativeActiveRequests) - 1);
          more.removeAttribute('aria-disabled');
          if (more.tagName === 'BUTTON') more.disabled = false;
          if (remaining === 0) more.remove();
        }, ${delay});
      });
      column.append(more);
    }
    const decoy = document.createElement('button');
    decoy.type = 'button'; decoy.textContent = 'Show more items';
    decoy.addEventListener('click', () => { document.documentElement.dataset.privateCardClicked = 'yes'; });
    document.querySelector('.wit-card').append(decoy);
  </script></body>`);
}
