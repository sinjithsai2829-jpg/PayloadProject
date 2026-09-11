const nav = document.querySelector('.diff-nav');
const prev = document.querySelector('#prevDiff');
const next = document.querySelector('#nextDiff');
const position = document.querySelector('#diffPosition');

const ICONS = {
  first: '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M4 4.5h12M10 16V7M6.5 10.5 10 7l3.5 3.5"/></svg>',
  previous: '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M10 16V5.5M6.5 9 10 5.5 13.5 9"/></svg>',
  next: '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M10 4v10.5M6.5 11 10 14.5l3.5-3.5"/></svg>',
  last: '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M4 15.5h12M10 4v9M6.5 10 10 13.5l3.5-3.5"/></svg>',
};

if (nav && prev && next && position) {
  configureButton(prev, ICONS.previous, 'Previous difference');
  configureButton(next, ICONS.next, 'Next difference');

  const first = document.createElement('button');
  first.id = 'firstDiff';
  first.type = 'button';
  configureButton(first, ICONS.first, 'First difference', 'diff-nav-absolute');
  first.disabled = true;

  const last = document.createElement('button');
  last.id = 'lastDiff';
  last.type = 'button';
  configureButton(last, ICONS.last, 'Last difference', 'diff-nav-absolute');
  last.disabled = true;

  nav.insertBefore(first, prev);
  nav.appendChild(last);
  nav.setAttribute('aria-label', 'Difference navigation');
}

function configureButton(button, icon, label, extraClass = '') {
  button.innerHTML = icon;
  button.title = label;
  button.setAttribute('aria-label', label);
  button.classList.add('diff-nav-icon');
  if (extraClass) button.classList.add(extraClass);
}

const style = document.createElement('style');
style.id = 'diff-nav-ui-styles';
style.textContent = `
  .diff-nav {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    min-height: 34px;
    white-space: nowrap;
  }

  .diff-nav .diff-nav-icon {
    width: 36px;
    min-width: 36px;
    height: 34px;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 7px;
    line-height: 1;
  }

  .diff-nav .diff-nav-icon svg {
    width: 19px;
    height: 19px;
    display: block;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.9;
    stroke-linecap: round;
    stroke-linejoin: round;
    pointer-events: none;
  }

  .diff-nav .diff-nav-icon:disabled {
    opacity: .34;
  }

  #diffPosition {
    min-width: 78px;
    padding: 0 9px;
    text-align: center;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  #prevDiff { margin-right: 3px; }
  #nextDiff { margin-left: 3px; }

  @media (max-width: 900px) {
    .diff-nav { align-self: flex-end; }
  }
`;
document.head.appendChild(style);
