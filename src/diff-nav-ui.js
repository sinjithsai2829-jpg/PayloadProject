const nav = document.querySelector('.diff-nav');
const prev = document.querySelector('#prevDiff');
const next = document.querySelector('#nextDiff');
const position = document.querySelector('#diffPosition');

if (nav && prev && next && position) {
  prev.textContent = '↑';
  prev.title = 'Previous difference';
  prev.setAttribute('aria-label', 'Previous difference');
  prev.classList.add('diff-nav-icon');

  next.textContent = '↓';
  next.title = 'Next difference';
  next.setAttribute('aria-label', 'Next difference');
  next.classList.add('diff-nav-icon');

  const first = document.createElement('button');
  first.id = 'firstDiff';
  first.type = 'button';
  first.textContent = '⤒';
  first.title = 'First difference';
  first.setAttribute('aria-label', 'First difference');
  first.className = 'diff-nav-icon diff-nav-absolute';
  first.disabled = true;

  const last = document.createElement('button');
  last.id = 'lastDiff';
  last.type = 'button';
  last.textContent = '⤓';
  last.title = 'Last difference';
  last.setAttribute('aria-label', 'Last difference');
  last.className = 'diff-nav-icon diff-nav-absolute';
  last.disabled = true;

  nav.insertBefore(first, prev);
  nav.appendChild(last);
}

const style = document.createElement('style');
style.id = 'diff-nav-ui-styles';
style.textContent = `
  .diff-nav { gap: 6px; }
  .diff-nav .diff-nav-icon {
    width: 34px;
    min-width: 34px;
    height: 32px;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 17px;
    line-height: 1;
  }
  .diff-nav .diff-nav-absolute { font-size: 16px; }
  #diffPosition {
    min-width: 72px;
    text-align: center;
    white-space: nowrap;
  }
`;
document.head.appendChild(style);
