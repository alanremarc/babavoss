# shell

The preset ui layer and application structure over the framework's primitives. An app built on the shell is a set of utils, mini-apps one per workflow or job, opened as tabs in one page.

```text
src/shell.ts      shell({ title, utils }): one surface of utils in tabs; a tab stands at /tabs/N, the util's paths below it
src/hosting.ts    viteUi(dir): the page served from source by Vite in middleware mode, under /_/
ui/               the shell page: app.tsx, the tab strip, the launcher, settings with appearance, the client of the door,
                  TabProvider and useTab for a util's component, layouts/ (the workbench for now), components/ (shadcn)
spec/             the shell surface, run as any surface
```

The shell is a built-in of the framework: it imports `../core`, and nothing in `core/` imports it. What a page on the shell is built from is the package's own dependencies; an app names what its own page imports, react among it.

An app's page is three files in its `ui/` directory: `index.html` copied from here, `main.tsx` rendering `App` with the utils' components, and `styles.css` importing the shell's. The design language and theming are the shell's; a util composes its page with a layout.
