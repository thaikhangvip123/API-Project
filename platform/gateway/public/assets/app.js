import { initializeAuth } from './auth.js';
import { initializeDashboard } from './dashboard.js';
import { initializeGraphql } from './graphql.js';
import { initializeSoap } from './soap.js';
import { initializeUsers } from './users.js';

initializeDashboard();
initializeAuth();
initializeUsers();
initializeGraphql();
initializeSoap();

document.querySelectorAll('[data-copy-target]').forEach((button) => {
  button.addEventListener('click', async () => {
    const target = document.querySelector(button.dataset.copyTarget);
    if (!target) return;
    const originalLabel = button.textContent;
    try {
      await navigator.clipboard.writeText(target.textContent);
      button.textContent = 'Đã copy';
    } catch {
      button.textContent = 'Copy thất bại';
    }
    window.setTimeout(() => { button.textContent = originalLabel; }, 1600);
  });
});

const navLinks = [...document.querySelectorAll('nav a')];
const sections = navLinks
  .map((link) => document.querySelector(link.getAttribute('href')))
  .filter(Boolean);

if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver((entries) => {
    const visible = entries
      .filter((entry) => entry.isIntersecting)
      .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];
    if (!visible) return;
    navLinks.forEach((link) => {
      link.classList.toggle('active', link.getAttribute('href') === `#${visible.target.id}`);
    });
  }, { rootMargin: '-20% 0px -65%', threshold: [0, 0.25, 0.5] });
  sections.forEach((section) => observer.observe(section));
}
