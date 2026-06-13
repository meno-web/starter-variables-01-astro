const toggle = el.querySelector('[data-faq-toggle]');
const answerEl = el.querySelector('[data-faq-answer]');
const icon = el.querySelector('[data-faq-icon]');

if (toggle && answerEl) {
  const updateHeight = () => {
    if (el.getAttribute('data-expanded') === 'true') {
      answerEl.style.maxHeight = answerEl.scrollHeight + 'px';
      answerEl.style.paddingBottom = '20px';
      icon.style.transform = 'rotate(45deg)';
    } else {
      answerEl.style.maxHeight = '0';
      answerEl.style.paddingBottom = '0';
      icon.style.transform = 'rotate(0deg)';
    }
  };

  toggle.addEventListener('click', () => {
    const isExpanded = el.getAttribute('data-expanded') === 'true';
    el.setAttribute('data-expanded', isExpanded ? 'false' : 'true');
    updateHeight();
  });

  window.addEventListener('resize', updateHeight);
}
