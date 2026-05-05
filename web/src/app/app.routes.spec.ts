import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { routes } from './app.routes';

describe('app.routes', () => {
  it('declares a root route, an about route, and a wildcard fallback', () => {
    const paths = routes.map((r) => r.path);
    expect(paths).toContain('');
    expect(paths).toContain('about');
    expect(paths).toContain('**');
  });

  it('lazy-loads each page component', () => {
    for (const r of routes) {
      expect(typeof r.loadComponent).toBe('function');
    }
  });

  it('resolves through the router without throwing', async () => {
    await TestBed.configureTestingModule({
      providers: [provideRouter(routes)],
    }).compileComponents();
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/about');
    expect(router.url).toBe('/about');
  });

  it('routes unknown paths to the wildcard handler', async () => {
    await TestBed.configureTestingModule({
      providers: [provideRouter(routes)],
    }).compileComponents();
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/this-does-not-exist');
    // Wildcard match keeps the URL as-is on success.
    expect(router.url).toBe('/this-does-not-exist');
  });
});
