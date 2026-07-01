// Karma's headless Chrome window happens to be narrower than 768px by
// default, which is what puts these assertions in the mobile branch of
// styles.scss's @media (max-width: 768px) rules — assert that assumption
// explicitly so a future change to the test runner's window size fails
// loudly here instead of silently changing what's being tested.
//
// These check the invariant that actually matters (a fixed, meaningful
// top-padding floor is applied on mobile, not 0 and not silently dropped
// back to a bare, possibly-zero env(safe-area-inset-top)) rather than an
// exact pixel value — the precise number is a visual-design choice that
// gets hand-tuned independently of this test's purpose.
const MIN_EXPECTED_PADDING_PX = 20;

describe('app-toolbar safe-area styling', () => {
  it('applies a fixed, non-zero top padding regardless of env(safe-area-inset-top)', () => {
    expect(window.innerWidth).toBeLessThanOrEqual(768);

    const el = document.createElement('div');
    el.className = 'app-toolbar';
    document.body.appendChild(el);

    const paddingTop = parseFloat(getComputedStyle(el).paddingTop);

    document.body.removeChild(el);
    expect(paddingTop).toBeGreaterThanOrEqual(MIN_EXPECTED_PADDING_PX);
  });
});

describe('sidenav-header safe-area styling', () => {
  it('applies a fixed, non-zero top padding floor on mobile viewports', () => {
    expect(window.innerWidth).toBeLessThanOrEqual(768);

    const el = document.createElement('div');
    el.className = 'sidenav-header';
    document.body.appendChild(el);

    const paddingTop = parseFloat(getComputedStyle(el).paddingTop);

    document.body.removeChild(el);
    expect(paddingTop).toBeGreaterThanOrEqual(MIN_EXPECTED_PADDING_PX);
  });
});
