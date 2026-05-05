import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { routes } from './app.routes';

describe('app.routes', () => {
  it('declares a landing route, a verify route, an about route, and a wildcard fallback', () => {
    const paths = routes.map((r) => r.path);
    expect(paths).toContain('');
    expect(paths).toContain('verify');
    expect(paths).toContain('about');
    expect(paths).toContain('**');
  });

  it('lazy-loads each page component', () => {
    for (const r of routes) {
      expect(typeof r.loadComponent).toBe('function');
    }
  });

  it('resolves the root URL through the router without throwing', async () => {
    await TestBed.configureTestingModule({
      providers: [provideRouter(routes)],
    }).compileComponents();
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/');
    expect(router.url).toBe('/');
  });

  it('resolves /verify through the router without throwing', async () => {
    await TestBed.configureTestingModule({
      providers: [provideRouter(routes)],
    }).compileComponents();
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/verify');
    expect(router.url).toBe('/verify');
  });

  it('resolves /about through the router without throwing', async () => {
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
