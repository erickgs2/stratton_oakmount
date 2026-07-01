describe('app-toolbar safe-area styling', () => {
  it('applies at least a 32px top padding floor regardless of env(safe-area-inset-top)', () => {
    const el = document.createElement('div');
    el.className = 'app-toolbar';
    document.body.appendChild(el);

    const paddingTop = getComputedStyle(el).paddingTop;

    document.body.removeChild(el);
    expect(paddingTop).toBe('32px');
  });
});
