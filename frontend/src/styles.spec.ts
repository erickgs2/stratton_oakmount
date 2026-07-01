// Karma's headless Chrome window happens to be narrower than 768px by
// default, which is what puts these assertions in the mobile branch of
// styles.scss's @media (max-width: 768px) rules — assert that assumption
// explicitly so a future change to the test runner's window size fails
// loudly here instead of silently changing what's being tested.
describe('app-toolbar safe-area styling', () => {
  it('applies a fixed 30px top padding regardless of env(safe-area-inset-top)', () => {
    expect(window.innerWidth).toBeLessThanOrEqual(768);

    const el = document.createElement('div');
    el.className = 'app-toolbar';
    document.body.appendChild(el);

    const paddingTop = getComputedStyle(el).paddingTop;

    document.body.removeChild(el);
    expect(paddingTop).toBe('30px');
  });
});

describe('sidenav-header safe-area styling', () => {
  it('applies a 44px top padding floor on mobile viewports', () => {
    expect(window.innerWidth).toBeLessThanOrEqual(768);

    const el = document.createElement('div');
    el.className = 'sidenav-header';
    document.body.appendChild(el);

    const paddingTop = getComputedStyle(el).paddingTop;

    document.body.removeChild(el);
    expect(paddingTop).toBe('44px');
  });
});
