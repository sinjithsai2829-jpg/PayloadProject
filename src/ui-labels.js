const formatButton = document.querySelector('#formatBtn');
const clearButton = document.querySelector('#clearBtn');

if (formatButton) {
  formatButton.textContent = 'Format';
  formatButton.title = 'Format both payload panels';
  formatButton.setAttribute('aria-label', 'Format both payload panels');
}

if (clearButton) {
  clearButton.textContent = 'Clear both';
  clearButton.title = 'Clear both payload panels';
  clearButton.setAttribute('aria-label', 'Clear both payload panels');
}
