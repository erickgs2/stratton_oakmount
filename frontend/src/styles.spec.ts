describe('app-toolbar safe-area styling', () => {
  it('applies at least a 44px top padding floor regardless of env(safe-area-inset-top)', () => {
    const el = document.createElement('div');
    el.className = 'app-toolbar';
    document.body.appendChild(el);

    const paddingTop = getComputedStyle(el).paddingTop;

    document.body.removeChild(el);
    expect(paddingTop).toBe('44px');
  });
});

describe('sidenav-header safe-area styling', () => {
  it('applies the same safe-area top padding floor as app-toolbar', () => {
    const el = document.createElement('div');
    el.className = 'sidenav-header';
    document.body.appendChild(el);

    const paddingTop = getComputedStyle(el).paddingTop;

    document.body.removeChild(el);
    expect(paddingTop).toBe('44px');
  });
});
