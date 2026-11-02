# Hostinger SPA deployment

This is a Vite single-page application. Upload the contents of `dist/` to the domain document root, including `dist/.htaccess`.

The `.htaccess` fallback serves `index.html` for client-side routes such as:

- `/login`
- `/super-admin/login`
- `/reset-password`
- `/super-admin/dashboard`

After changing the domain, rebuild and upload `dist/` again. The password reset redirect uses the current browser origin, so the frontend does not contain a permanent deployment domain.

In Supabase Authentication URL Configuration, update the Site URL and add the new domain's exact reset path whenever the public domain changes:

```text
https://your-current-domain.example
https://your-current-domain.example/reset-password
```
