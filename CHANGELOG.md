# Changelog

What each version of babavoss changed, newest first. A release is the tag vX.Y.Z of this repository; a project's `.baba/` names one. Versions follow semantic versioning and are set by hand, in `package.json`, in the commit that makes the change. An agent reads this after taking a release, from the version its roles ran on up, to adapt them.

## 0.54.1

- The preset claude is named clay, "Clay": `theme=clay`, `presetOf("clay")`. A settings file that says claude reads as clay; a call or code that names the preset must say clay.
- An eye of the mark may have a `lens`: it grows as a turn brings it to the sphere's middle and shrinks towards the edge. The brand's eyes have none and the shell's mark is unchanged; this repository's Design Guide tries it at `/guide/mark/variants`, beside the brand's.

## 0.54.0

- Breaking: the kit's palettes are generated. A theme is three numbers, `{ hue, tint, vivid }`: a hue from 0 to 360, how strongly the greys are tinted toward it and how vivid the accent is, each from 0 to 100. Every colour token is derived from them in CSS, over lightness fixed per mode, so text keeps its contrast at any hue; `framework/kit/theme.ts` is the source and `theme.css` is written from it. The token names are unchanged, so a component that reads them, shadcn's among them, follows the theme as before.
- Breaking: the root's `data-theme` no longer selects a palette and `:root[data-theme="claude"]` rules are gone: the colours come from `--theme-hue`, `--theme-tint` and `--theme-vivid`. A surface's stylesheet that keyed on `data-theme` must stop. Any element with `data-theme` and those three variables takes that theme's tokens, in its own mode where it has the class `dark` or `light`.
- The presets are neutral, claude, slate, sand, moss, ocean and plum, a row each in `PRESETS`; "dynamic" is a theme whose numbers are the person's. The generated claude keeps its accent; its light ground is white where it was cream, and its dark ground is darker. Light `success`, `warning` and the thread's context colour are a little darker, and `chart-1` to `chart-5` are a ramp of the accent: greys under neutral.
- The person's settings: `appearance` is `{ mode, same, themes: { light, dark } }`, a theme a preset's id or `{ hue, tint, vivid }`; with `same`, the default, `themes.light` is both modes'. A file from before reads as it was. The settings surface's actions: `theme mode=both|light|dark theme=PRESET|dynamic`, `dynamic mode= hue= tint= vivid=`, and `same on=`; `mode=both` is for modes that are the same, `light` and `dark` for distinct ones.
- `useShell().appearance` is `{ mode, theme, numbers }`: `theme` a preset's id or "dynamic", `numbers` the theme's three numbers, current while a dynamic theme is dragged.
- The kit has `ThemePicker` (`babavoss/kit/components/theme-picker.tsx`): `value`, `onChange` on every move, `onCommit` on release; and exports `PRESETS`, `presetOf`, `derive` and `varsOf`.

## 0.53.2

- The mark takes the two eyes it draws and moves: `pair` on `Logo` and `Eyes`, and as `orbiting`'s third argument, the brand's `EYES` by default, so a variant of the mark can be tried. This repository's Design Guide shows such variants at `/guide/mark/variants`, eyes of one size among them. The mark in the shell is unchanged. Nothing to adapt.

## 0.53.1

- This repository's Design Document surface opens on a scenario picker, and a scenario is two screens of one frame over a strip of its steps: the person's page after the chosen step, and what the agent was given at it. The scenario and the step are the tab's route, `/design/scenarios/NAME/N`. Each scenario's row at `/design` carries `about` as detail. The package is unchanged. Nothing to adapt.

## 0.53.0

- The shell's page exports the parts of it that only show: `ActivityButton` and `ActivityLevels` (notifications.tsx), `RefusedAlert` and `PointedAlert` (connection.tsx), `TabBroken`, `TabFailed` and `TabNoPage` (tabs.tsx), `RefusedLine` (actions.tsx). `TabMenu` takes an optional door, and a tab's own controls are one function, `controlsOf` in commands.ts. The mark takes an optional named move, `MOVES` in gaze.ts, and repeats it. The shell looks and behaves as before. Nothing to adapt.
- This repository's `.baba/` has a surface `guide`, the Design Guide: the mark in each state, the kit's tokens, components and layouts, and the shell's elements, each drawn by the real component. Its spec fails when a file of `framework/kit/components` or `framework/kit/layouts` has no specimen.

## 0.52.0

- A session's runtime knows which harness its agent runs in: a hook names its adapter with what it tells of the turn, in the header `babavoss-harness`, and the runtime keeps the one last heard beside the session's state. The page is given it in the turn, as `harness`, and home's foot says it after the session: Claude Code, Codex, or an adapter's own name. A session whose hooks were never heard has none. `hookContext(event, baba, harness)` takes the adapter's name as its third argument. Nothing to adapt in a project.

## 0.51.4

- An open tab's line in home's list carries its mark on its icon, as its pill in the strip does: broken, waiting on the person, or needing the agent. The words beside its name are gone, what it needs and "previous" alike; hovering the icon says them. Nothing to adapt.

## 0.51.3

- A line of home's list ends with its action alone, without the Enter sign, and a surface with no tab open says "Open in new tab". Nothing to adapt.

## 0.51.2

- Each line of home's list says at its end what Enter does on it, "Go to tab" or "Open", the same whether it is the chosen line or not; it no longer says what kind of thing the line is, and home's foot no longer repeats the chosen line's action. Enter with the command key still opens another tab of an open tab's surface. Nothing to adapt.

## 0.51.1

- Home no longer offers a command that ends the person's move, "End my move" or "Copy the message that ends my move": the person writes to the agent themselves. What they did on the page still waits for its next turn and is counted on the activity's button. Nothing to adapt.

## 0.51.0

- The appearance's mode "system" follows the machine the runtime is on, where the runtime can tell its mode, and the browser's `prefers-color-scheme` only where it cannot: an embedded browser can report light on a dark machine. The page is served with the machine's mode, so its first frame is right, and a page shown in system mode asks again every five seconds. Today the runtime can tell on macOS, from `AppleInterfaceStyle`; elsewhere nothing changes. `BABAVOSS_SYSTEM_MODE=browser` in the runtime's environment leaves the answer to the browser.
- How a machine is asked is an adapter, `framework/shell/settings/src/system/`: one file per operating system with `name`, `fits(platform)` and `read()`, named in `ADAPTERS` in its `index.ts`. Nothing to adapt in a project.

## 0.50.3

- The activity's button in the strip shows a log's lines in place of a stack. Nothing to adapt.

## 0.50.2

- The tab shortcuts' defaults are swapped: `mod+j` goes to the previous tab, the one to the left, and `mod+k` to the next, to the right. A person who bound their own keys keeps them. Nothing to adapt.

## 0.50.1

- A tab's menu opens from three dots that take the icon's place only while the pointer is on the icon, no longer from a caret shown wherever the tab is hovered. A click on the icon opens the menu; a click on the rest of the tab selects it, and a right click anywhere on it still opens the menu. Nothing to adapt.

## 0.50.0

- A session's runtime no longer stays alive and deaf after changed code is loaded. After a failed hot reload, a file gone for a moment in a checkout or code that does not parse, bun stops waking the process for its timers, and a runtime restarting for the framework's changed code then waited for ever with its port closed. A runtime now gives way to a fresh process once bun has said a reload failed in it. Its close is bounded by the clock, and after every load in place it checks that its door still answers; where it does not, it ends and a fresh runtime takes the state. Nothing to adapt.
- A command whose runtime is alive but refuses connections for longer than a close takes ends that process, only if it is this session's runtime, starts a fresh one with the state kept, and says so in one line. The client is version 12 and replaces installed copies.

## 0.49.0

- A surface's page may use any React library: `bun add NAME` in `.baba/` and import it. The page always has one React, the framework's, whatever a library or the install brings, so "Invalid hook call … more than one copy of React" no longer happens.
- `.baba/` is ready for shadcn: `bunx shadcn@latest add NAME` in `.baba/` writes the component to `components/ui/`, shared by every surface and imported as `@/components/ui/NAME`. It reads the shell's tokens, so it follows the palette and the mode. `baba init` writes `components.json` and the `@/` alias in `tsconfig.json`; provisioning adds both to an existing `.baba/` where they are missing. Commit them.
- Tailwind scans the whole of `.baba/` except `node_modules`, so the project's own components are styled. A `@source` line in a surface's `ui/styles.css` now works, its path from that file, for a package whose classes must be generated.
- `useShell()` from `babavoss/shell/ui/index.tsx` gives a page the shell's services by convention: `toast(text, at?)`, a toast from the tab that is not kept and not told to the agent; `open(surface)`; `go(at)`; and `appearance`, `{ mode, theme }`. A surface's notices from `update` remain how both sides are told what happened.
- The kit's theme defines shadcn's `sidebar-*` tokens from each palette.
- Nothing to adapt.

## 0.48.0

- What the agent is told is cut to what it needs. A quiet action, `action({ quiet: true })`, or an update returning `quiet: true`, is the page's own bookkeeping, told to the agent in no way and kept out of the activity; the shell's seen and looked and every settings change are quiet. A change no one made, as changed code or a restored state makes, is not told. A notice stands for the changes of the update that gave it; a need of the agent's is told all the same. A tab the agent neither read nor called in this turn or the last, and that does not need it, is one line at a boundary.
- `detail(value)` from `babavoss/core/index.ts` marks a fact or a row as detail: read whole at the tab's path and by the page, counted in one line in the present at `/`. Mark finished rows and counters with it.
- Breaking for specs that match tellings: a tab opened is one line, `+ PATH "TITLE", actions: a, b; read PATH`; an action offered or withdrawn reads `+ action NAME` and `- action NAME`, also in a story's `told()`; a reorder reads `PATH moved up` and never `order now …`. A path names one fact of the view above it, as `/queue/issues`.

## 0.47.0

- Kit: `DropdownMenu` and its parts, `Badge`, `Marker`, an inline line or labelled separator in a conversation, and `ResizablePanelGroup`, `ResizablePanel` and `ResizableHandle`, from shadcn, in the type scale. `ThreadStep` takes `onOpenChange` and `ThreadSteps` takes `initial`, so a page can keep the open step in its route. The kit's class merger keeps a type-scale size, `text-meta` and the others, beside a text colour; it used to drop it, so some small labels in messages, the composer and the shell were the wrong size. Nothing to adapt.
- In this repository the lab shows a run as a conversation: bubbles for what is said, folded steps for what entered the context between, a divider per turn, a header for the run's lifecycle and the runs kept, and a composer that picks the model and starts a run from its first message.

## 0.46.0

- Breaking: a tab stands at its surface's name. The tab opened while no other tab of its surface holds the name is `/NAME` until it closes, so `/queue/issues/42` survives the tab being closed and opened again; a second tab of a surface is `/tabs/N`, and `/tabs/N` still reaches any tab. Reads, calls, `show at=` and the page's URLs take either; every path the shell gives, tab rows, `at` facts, notices, needs, `pointed` and activity, is said by the address. At `/` a tab's heading is `/queue "Queue" (tab 10)`, and a second one `/tabs/11 queue "Queue"`. A spec matching `/tabs/1 NAME "Title"`, `at: "/tabs/1…"` or `NAME /tabs/1` in what the agent is told now matches `/NAME "Title" (tab 1)`, `at: "/NAME…"` and `/NAME`.
- A path into a tab that is closed, or into a surface with no tab open, is answered with what happened and where to go, `/tabs/3, the queue tab 3, was closed by the person; queue is now at /queue (tab 10)`, instead of `nothing at`. A surface may say the same for its own paths with the optional `absent(model, path)`.
- Breaking: `tabs` and `activity` are reserved names, like `baba` and `settings`. Rename a project surface called either.

## 0.45.0

- A session resumed, forked or compacted is given a short reminder of baba's words (`skill/reminder.md`, also in the plugin) and then the whole present, instead of the whole words again. A new or cleared session still gets them whole.
- The first answer names the page and the command, and no longer says where `bv` and `baba` were put or repeats the skill's help.
- A command's answer says once when this session's hooks have gone quiet, or never spoke, and calls alone no longer keep the page's turn reading as working.
- While changed surface code loads, reads and calls are held, up to about 40s, and answered by the new code. A call the old code took as it stopped is given to the new one. The agent is told of a reload only when work was cut or the new code did not start.
- A call whose answer was lost says its outcome is unknown: read before retrying.
- The client is version 11 and replaces installed copies.

## 0.44.1

- Home is one list with each thing once, and no headings: the open tabs, the surfaces with no tab open, then the shell's commands. A line names the thing and says what kind it is; the chosen line and the foot say what Enter does on it, Go to tab, Open or Run. Enter with the command key opens another tab of an open tab's surface. Nothing to adapt.

## 0.44.0

- The activity is gathered into channels, one a tab, as a messaging app lists its conversations. A channel shows its surface's icon, its name and when it last said something, then a preview of that, or what the tab needs of the person. Channels go newest first, and a tab that needs the person is pinned above. The shell's own opening and closing of tabs is one more channel, named after the root. A closed tab's channel stays, marked closed. Choosing a channel shows its history, newest first, grouped by when, each entry opening to its whole. Escape, Backspace or the left arrow go back, and Go to tab brings the tab forward. Notices · All stays, and Needs you is gone, since a need is shown on its channel. The agent sees next is one folded item at the top that opens into the person's waiting calls. Nothing to adapt.
- Seeing is per channel: opening the activity no longer sees everything. Opening a channel sees its notices, which stay dotted until it is left. Mark all seen sees them all, and clicking a toast opens the activity on its channel. For the person, `/activity/notices` also gives `fresh`, the numbers of the notices not yet seen. Every row of `/activity` gives `tab`, the tab it was in, even once that tab is closed; the shell's own opening, closing and showing of tabs has none. Nothing to adapt.

## 0.43.8

- A submenu stands a little off its parent, by the gap a tab's menu keeps from the strip, and no longer over it. Nothing to adapt.

## 0.43.7

- A tab's menu is an ordinary one again, rounded and lined all round, standing a little under the strip. A submenu opens over its parent's edge, covering the arrow it grew from, its first entry level with the entry it grew from. Nothing to adapt.

## 0.43.6

- The activity's button is a stack, and carries the count of the person's changes that wait for the agent's next turn, which the mark no longer does. The activity opens on them, under The agent sees next: what the agent is told with the person's next message. Nothing to adapt.

## 0.43.5

- A tab's menu hangs from the same spot however it is opened: the caret's button keeps its place and size, and only the caret in it grows into view. It used to hang a few pixels high and to the right when opened before the caret had grown. Nothing to adapt.

## 0.43.4

- A tab's menu has no line along its top and starts on the pixel under the strip's lower border, which is its top edge. Nothing to adapt.

## 0.43.3

- A page that lost its runtime shows it in the mark alone: the larger eye comes to the centre and turns red, the smaller goes round it, and hovering the mark says Reconnecting. The bubble under the mark is gone. Nothing to adapt.

## 0.43.2

- Home lists a surface by its name alone. Its description, written for the agent to choose it by, still finds it in the search and is told on hover. Nothing to adapt.

## 0.43.1

- A menu that is longer than its room scrolls up and down with no bar to show for it, the search being the way through it, and never sideways: every entry is cut at the menu's edge. The kit exports `quietScroll` for a list that scrolls so. Nothing to adapt.
- In this repository the queue switches between its list and its map from a toolbar of icons floating at the page's foot.

## 0.43.0

- A refresh is drawn whole in its first frame: the root's door serves the page with an island of JSON, `<script type="application/json" id="babavoss-boot">`, holding the stream's version, the turn and the views the root names for the page's path (`RootDefinition.boot`); the shell names `/`, the notices and the shown tab's views at its `/` and route. Nothing says connecting on a normal load, and the shell's alerts stand over the content without moving it.
- A tab's page is shown once its first `useLive` reads have answered, dependent ones too, on its quiet ground meanwhile; a new path keeps the old view until its own lands, and a change replaces views in place. Each tab keeps one cache of its views, for its page and its menu. Nothing to adapt, but a page should draw no loading state of its own: an empty state it draws is now always true.
- While the runtime is out of reach a page keeps the views it read, with no error; `useLive`'s `error` is for a path that refuses or is not there.

## 0.42.2

- A page whose runtime is gone stays as it is, reconnecting, and loads again only once its address answers; it used to load into the browser's own error page. Nothing to adapt.

## 0.42.1

- A page that lost its runtime says so in a small bubble under the mark, Reconnecting, and the mark's eyes shut until it is back; the bar under the strip is gone, and a page still loading shows neither. The dot on a tab stands still while its icon gives way to the caret. Nothing to adapt.

## 0.42.0

- Breaking: ⌘P or Ctrl+P goes home and back; ⌘K no longer does. ⌘J and ⌘K go to the next and previous tab, home first, wrapping round. They work anywhere on the page but in a text field, so a page should not bind them itself.
- Breaking: home is the shell's own page: the surfaces to open, the tabs to switch to, and the shell's commands. A surface's actions and places are only in its tab's menu. Check that nothing tells the person to find them on home.
- Settings is a surface that comes with the shell, listed as `settings`. It holds the appearance, the shortcuts (`bind command= keys=`, `reset command=NAME|all`) and whether the mark animates while the agent works (`animate on=`). They are the person's, kept in `~/.babavoss/settings.json` (`BABAVOSS_SETTINGS` names another file), the same in every session and project. A browser's earlier appearance cookie is taken in once.
- Breaking: `settings` is a reserved name, like `baba`. Rename a project surface called `settings`.

## 0.41.0

- The notifications are an activity log: one line an entry, who as a small mark, what, its place as a quiet token, how long ago, grouped Now, Earlier today, Yesterday, then by date, with what needs the person pinned above under Needs you. Hierarchy is carried by type and colour alone: what was new when the log opened stays in the foreground with a dot until it closes. It opens on Notices; All adds a line for every call; Mark all seen clears what is new. The bell carries one dot. While the log is open no toast is shown: a toast on screen leaves into it and a notice heard comes in as its newest line. Toasts are one line. Nothing to adapt.
- Kit: `ToastItem.title` is optional, and a toast takes `mark`; `Toasts` takes `away` to send every toast away at once. The `Sheet` sets the frame's body size on its content. Nothing to adapt.

## 0.40.2

- A tab's menu's search also finds an entry by its way in the menu: "go" finds every place, Go being where they are listed, and a word of where an action is offered finds it. What meets the query by its label comes first, then by its way, then by its path or description; among equals what waits on the person. A place found says Go beside it. Nothing to adapt.

## 0.40.1

- In a menu the mark of what waits on the person stands at an entry's right, so a menu keeps no room at its left for it. Nothing to adapt.

## 0.40.0

- `sessionDir()` from `babavoss/core/state/session-dir.ts` gives a surface's command the session's own directory under the project's `.babavoss/`, where a surface may keep what belongs to the session and not to a tab; it gives nothing outside a runtime. Nothing to adapt.
- In this repository the queue and the map are one surface, the session's work seen as a list and as a map, kept in the session's directory and shared by its tabs.

## 0.39.5

- A tab's menu hangs from the strip: its top is square and on the strip's lower border. It opens from a caret that takes the tab's icon's place and turns over as it opens, and from a right click anywhere on the tab. The surface's own actions stand in it without the surface's title, which the tab has. `MenuDropdown` in the kit takes `sideOffset`, `alignOffset` and `className`. Nothing to adapt.

## 0.39.4

- A tab under the keyboard's focus has no ring: it reads as one hovered, with its ground and its dots. Nothing to adapt.

## 0.39.3

- A menu keeps room at its left only where it has something to put there, a mark of what waits on the person or a tick; without one its entries start at its edge. The kit's `menuItem` class is now `menuRow`, without the padding. Nothing else to adapt.

## 0.39.2

- A working agent unheard by the hooks for 90 seconds, with no call of its own under way, reads as unknown; it was five minutes. So a turn whose end the hooks missed stops showing as work soon. The mark's eyes settle to rest from wherever they were. Nothing to adapt.

## 0.39.1

- The mark's ground changes at once, as a tab's does. Nothing to adapt.

## 0.39.0

Harnesses are set up by adapters, and `.baba/baba.config.ts` chooses them.

- Breaking: Claude Code is made aware by a project plugin: `.claude/skills/baba` is a link to `node_modules/babavoss/plugin/claude`, which holds the skill and the hook. Provisioning removes babavoss's hooks from `.claude/settings.json` and replaces the old skill folder; reinstall in `.baba/` and commit the link. A folder of your own named `.claude/skills/baba` stops provisioning.
- Breaking: `baba hook` takes the harness, `baba hook claude` or `baba hook codex`, defaulting to `claude`. `provision()` is async and answers `{ written, withdrawn, said }`. `provisionHooks`, `SKILL_FOLDERS`, `HOOK_EVENTS`, `HookInput` and `hookOutput` are gone from core. `hookContext` takes a `HookEvent`.
- Codex gets the hook in `.codex/hooks.json`, among your own hooks; Codex asks you to review it once with `/hooks`.
- Optional `.baba/baba.config.ts`: `config({ harnesses: { claude: { enable, events }, codex: { enable, events, network } } })` from `babavoss/core/config.ts`. `enable: false` withdraws at the next provisioning; `events` is read as the hook runs. A config that does not load stops provisioning and keeps the hooks silent, and `baba start` says so.
- The Claude run face trusts the session's project, and a worktree's main checkout, in its own home, so the plugin loads in lab runs.
- The mark has a dim ground while the agent works.

## 0.38.1

- The mark's eyes sit on an invisible sphere, the circle of home's tab: while the agent works the face looks about as one that thinks, down, aside, across, narrowing to focus, each turn eased and in no fixed order, an eye narrowing as it nears the sphere's edge. Frames run only while the eyes turn, and not on a page that is not shown. Nothing to adapt.

## 0.38.0

- The bar above every tab is gone; a page fills its tab under the strip. Each tab in the strip carries its surface's menu behind dots that replace its icon on hover or focus, and on a right click or Shift+F10. The menu holds a search of the tree's actions and places, the actions at `/` under the surface's `title`, the current place's actions under its name, `Go`, and the shell's Close tab, Close other tabs, Copy link and Reload. `menu` facts, `title` or `name` on rows, and drawers work as before. Nothing to adapt, but check that a page does not assume a bar above it.
- What waits on the person carries one dot, on the tab and on every step of the way to it in the menu: an ask, or a notice not yet seen about a place. Give asks and notices an `at` where they belong, so the dot leads there.
- Home is the babavoss mark, which also shows whose move it is: still, looking about while the agent works, and counting the person's changes that wait for its next turn. Home offers to end the person's move. The turn indicator at the strip's right is gone.
- The notifications open as a drawer from the right edge.
- The menu-bar setting and ⌘\ are gone. The kit gains `MenuDropdown`, `SearchMenu`, `DropdownKit` and `Sheet`.

## 0.37.0

- Breaking: the bar above every tab is the shell's alone, made from the surface's views. A menu named by the surface's `title` holds the actions at `/`. Where the route is below `/`, a menu for that place holds its actions, asks first. `Go` lists the places the view names under `at`, by their row's `title` or `name`, and the way back up. `Help` searches the actions and places of the tree below the tab. `useMenus`, `MenuBar`, `MenuHostContext` and `MenuHost` are gone from `babavoss/kit`, and `Plain` and `Workbench` no longer take `label`, `menus` or `viewMenu`. Move every entry a page put in the header into the page's content, a toggle or a button in its own toolbar, as page state; none of it becomes an action of the surface.
- An action with inputs opens a modal: the shell's form, or the page's own drawer, `export const drawers = { NAME: Component }` with `{ handle, path, view, submit, close }` (`DrawerProps` from `babavoss/shell/ui/index.tsx`). `submit` resolves with the refusal reason, which the modal shows while staying open.
- A view may order its actions in the bar with a `menu` fact, `[{ label, actions: [names] }]`. Give it below `/` so it stays out of the present.
- Name each place by a `title` or `name` in its row, so `Go` and `Help` can name it.
- The person can hide the menu bar from home, Settings or ⌘\. Nothing to adapt.

## 0.36.0

- The strip is the page's header, at the top: home's `+`, the tabs newest first, and at its right whose move it is and the notifications. Below it stand a tab's frame and its content. The notifications panel opens downward and toasts come in under the bell. A surface whose page assumed a strip at the bottom should check its layout.
- The `+` is home, the first tab, at `/`. It is the palette filling the page: the asks, actions and menus of the tab shown before it, the surfaces to open, the open tabs and the settings. ⌘K or Ctrl+K goes home from any tab, and back; Escape returns. A surface that does not load is listed there as broken, with its error, and cannot be opened. The popover launcher is gone.
- `Toasts` in the kit takes `from: "top" | "bottom"`, the edge the stack stands at. Nothing else to adapt; what the agent reads is unchanged.

## 0.35.0

- What was heard and not yet told to the agent is kept on disk, so a root that sleeps, reloads or starts again still tells each notice once; more than 20 waiting are told as the newest 20 after `N earlier notices; read /activity/notices`. Nothing to adapt.
- A surface whose code does not load no longer takes the root down: `/` lists it in `surfaces` as `{ name, broken }` with the error and where it is, it cannot be opened, and its open tabs are broken with why and come back with their state when the code loads. `.baba/.root/surfaces.ts` now names each surface as `() => import(…)`; installing in `.baba/` generates it again.
- While the page does not build, the root serves the last page that did, also after its code is loaded again.
- The version a running root tells is read from the package each time, so it is right after a release is taken without a restart.

## 0.34.0

- Claude Code's adapter hands on no account, organisation or user id and no address, in any field or text, the process's stderr included. An adapter for another harness should do the same.
- In this repository's lab, a closed run keeps only its record, `run.json` and the timeline: its project and home, the harness's transcripts among them, are deleted. `/runs` offers `forget id=`, and only the last 20 records are kept. When the lab starts, it clears what a lab that is gone left behind.
- What the person does on the page under test joins the lab's timeline as entries of kind `person`, read from the root's `/activity`. A run's first entry says the lab is left out of the copy.

## 0.33.0

- A handle the person alone may call carries `ask: true` in the view the person reads, and the frame knows an ask from that view alone. `action({ ask: true })` sets it. A surface that offers a person-only handle through its own `view` instead of `action` should pass `ask` as `handle()`'s fifth argument, or the frame shows it as an ordinary action. The agent's views and text are unchanged.
- A story can drive a command that keeps running: `world.send(command, event)` gives one event and leaves the command running, and the actors see and are told between events; `world.end(command)` ends it. Nothing to adapt.
- The kit's components size all text by the type scale, `text-badge`, `text-meta`, `text-body` and `text-large`; some small labels moved by 1px. A surface's page should do the same.
- What the agent reads calls the root of `.baba/` the shell: the skill baba, the hook's lead lines, "In the shell of .baba/: …", "Heard in the shell of .baba/ while you worked:" and "The shell of .baba/ was started…", and `baba`'s usage. A spec that matches those lines must follow. Installing in `.baba/` provisions the skill again.
- In this repository `bun check` and `bun test` cover `.baba/surfaces` too.

## 0.32.0

- The present is told as events on things. Each open tab is one heading, `PATH SURFACE "TITLE"`, with its facts under it and its actions by name. List rows are named by `at`, `n`, `id`, `name` or `key`, so a reorder is one line and a changed row is one line of what changed. `how` is told in a change only by where to read it, long texts are cut with where to read them, and a telling stops at 40 lines. `needs` is a table first at `/`, and each need added, gone or changed is one line. One `open` per surface is printed once as `open surface=NAME`. A read of `/`, by the word or by a program's `root.read("/")`, gives the present whole, and changes are counted from it.
- During work the agent is told only what was heard: notices, and "the person acted on SURFACE PATH" once per tab. The present's changes come with the person's message, at the end of a wait, or whole on a read of `/`. A call answers with its own change and what was heard. A wait ends on a notice or a change to `needs`, not on a fact a surface changed by itself.
- A surface whose change should reach the agent mid-turn should give a notice; a fact alone waits for the boundary. A fact that is not at `/` is in no telling: only a notice or a read reaches it.
- Breaking: `flatten` and `changes` are no longer exported from `babavoss/core/index.ts`; `whole`, `diff` and `tell` are. A story's `told()` uses the new shapes, so a spec matching `issues.0.status: …` now matches `/issues/1: status …`, and `- attention.who` reads `- attention`.

## 0.31.0

- The strip's right has one notifications button: a bell counting the notices others caused that the person has not seen. Its panel opens on Notifications, with a switch to All activity. A toast hides into the button when it passes.
- Activity entries say whether a surface said them: `notice` on the entry, `kind` (`notice` or `call`) at `/activity`, and `/activity/notices` for the notices alone. A call without a notice appears only under All activity, so give a notice where the person should hear of it.
- What the person has seen is kept in the shell's state per session, so a refresh or a page opened later shows the right count. `seen` and `looked` are person-only actions at `/activity/notices`, and the agent is told nothing of them.
- `Toasts` in the kit takes `into`, where a passed toast goes.

## 0.30.0

- The framework has a harness layer, `babavoss/core/harness/index.ts`: a `Harness` interface whose sessions report normalised events, Claude Code's adapter (`claudeCode()`, with the pure `claudeEvents(line)` parser), and `fakeHarness()` for stories. A surface that drives an agent uses it instead of spawning `claude` itself.
- A session the adapter starts has a home of its own, which reaches the person's login through a link, never a copy; the link and the account files the harness writes there are removed when the session's home is released.

## 0.29.0

- The framework's hook is now also provisioned for `Stop`, `StopFailure` and `SessionEnd`. It tells the session's runtime whose move it is, adds no context at those events and never blocks stopping. Installing in `.baba/` provisions it again.
- The shell's strip shows whose move it is: the agent working, idle, or unknown. When the agent is idle it shows how many of the person's changes wait for its next message, with a button that copies a message to send. A surface should drop any busy indicator or end-of-move button of its own.
- The door has `POST /_/turn` and a `turn` event on the page's stream; a page that counts stream events now receives `turn` after `change` when it connects. Nothing about the turn is in the present.

## 0.28.0

- The shell keeps the session's activity: every notice, every call into a tab that gave none (as its handle and arguments), and every tab opened, closed or shown. The agent reads it at `/activity`, named at `/` by `activity: { at: "/activity" }`, and is never told it. The person sees it in a panel at the strip's right. A surface that wants a meaningful line there instead of the mechanical one gives a notice.
- A call carries `t`, the time it was admitted, in ms since the epoch. An update that keeps time reads it there, never from a clock. Nothing to adapt.

## 0.27.0

- A surface no longer says who it waits on as free text (`waiting: "the person, to …"`). It says `attention: { who: "person" | "agent", why }` at `/`, or a list of them; replace each `waiting` fact with it, and drop `waiting` where nobody is needed.
- What `update` returns may now carry `notices`, short lines on what just happened, beside `model` and `commands`. Add one where a call or a command's event finishes something the other side should hear of, and assert them in specs with `agent.noticed()` / `person.noticed()`.
- The present now says first, under `needs`, which tabs need the person or the agent and why; `attention` is no longer among that tab's facts at `/`. Answers and hooks tell what was noticed since the last answer, once, under `notices:`, before what changed. A notice ends a `wait`. What only the agent's own call noticed is not told back to it.
- On the page a tab that needs the person is marked in the strip, a notice is a toast that goes to where it happened, a broken tab is marked, and the launcher says when a later babavoss is out.
- `Running` has a new `notices(fn)`. Anything that implements `Running` by hand must add it.

## 0.26.0

- The shell now frames every tab: the title, the page's menus, an Actions menu with the actions the surface offers at the tab's route and at `/`, and the asks on the right. ⌘K offers all of them first.
- A surface's `ui/index.tsx` should return its content alone: remove the `<Plain label="…">` wrapper, which only drew a bar. Give the page's own commands with `useMenus([{ id, label, items }])` from `babavoss/kit/index.ts`.
- `Plain`, `Workbench` and `MenuBar` still work; inside the shell their menus move into the frame. Keep a layout only for what it adds inside the content.
- Handle names and descriptions now also label buttons and menu items the person sees; name them for both readers.

## 0.25.0

- The shell offers `show at=PATH` at `/` while a tab is open: the person's page brings that tab to the front and opens that route. While the person is writing in a field, or acted on the page in the last few seconds, the page offers the place to click to instead. `/` carries `pointed`, the place last shown and its count.
- A place is a path the surface has a view for, so give each thing its own path (`/issues/:n`), name it under `at` in rows, and keep the page's selection in `useTab().route` with `navigate`, so a refresh, a link and the agent's pointing land on it.

## 0.24.0

- The shell is now the root surface of `.baba/`, and there is no picker tab. At `/`, `utils` is now `surfaces`, each `{ name, description, open }`. With no surfaces, `/` has `empty`, and with no `.baba/` it has `missing`.
- A tab row's `util` is now `surface`: `tabs.N.util` → `tabs.N.surface`. `open util=NAME` → `open surface=NAME`.
- Since the picker no longer takes tab 1 and `tabs.0`, the first surface opened in a new session is `/tabs/1` and `tabs.0`. A session's kept state is migrated: its picker tab is dropped and its other tabs keep their numbers.
- Import paths: `babavoss/shell/ui/index.ts` → `babavoss/shell/ui/index.tsx`; change it in each surface's `ui/index.tsx`. `useTab().util` is now `useTab().surface`.
- The element that wraps a tab's content carries `data-surface="NAME"`, no longer `data-util`; a surface's `ui/styles.css` is scoped with `@scope ([data-surface="NAME"])`.
- `babavoss/shell/index.ts` is gone; hosting is `babavoss/shell/src/hosting.ts`. `babavoss/root/*` is gone.
- `"surfaces"` is no longer a reserved surface name.

## 0.23.0

- The kit's theming tokens are now one named contract, listed in `framework/kit/defaults.css` and in the "Looks" section of `skill/making-surfaces.md`. Replace literal colours, fonts and sizes in a surface's page with them: `text-badge`, `text-meta`, `text-body` and `text-large` for UI text.
- New colour tokens `success`, `warning` and `info` are defined for every palette and mode. Use `text-success`, `bg-warning/10` and so on instead of Tailwind's palette colours.
- Breaking: `sidebar-foreground`, `sidebar-primary`, `sidebar-primary-foreground`, `sidebar-accent`, `sidebar-accent-foreground`, `sidebar-border` and `sidebar-ring` are removed. Use `foreground`, `primary`, `muted`, `border` and `ring`; `sidebar` remains.
- A surface may add `ui/styles.css`. The root includes it after the shell's styles, scoped to the surface's own tabs with `@scope ([data-util="NAME"])`. Set custom tokens, or override shell tokens for those tabs, on `:scope`, and do not import the file from `ui/index.tsx`. A file whose braces do not balance is left out.
- Every tab's content is now wrapped in an element carrying `data-util="NAME"`.

## 0.22.2

- The shell's strip now starts with a "+", the launcher: it opens a palette to open a surface, switch to an open tab or reach settings, filtered as you type, also on ⌘K / Ctrl+K anywhere on the page.
- Open tabs now run newest first: a new tab appears right after the "+". One the person opens becomes active; one the agent opens is marked with a dot until looked at and does not take focus.
- Closing the active tab now lands on the next older tab instead of the launcher page.
- Surfaces need no change.

## 0.22.1

- A running root no longer goes on serving old code after a hot reload fails or misses a change, as a checkout, a delete-and-recreate or briefly broken code can cause: its runtime notices before it answers, or when bun logs the failure, and gives way to a fresh one at the same address, which says so and what it cut.
- When a surface's code does not load, the answer now says why and in which file, instead of a message about the sandbox. While the code is broken the root is down; the next call after it is fixed wakes it.
- The root follows `surfaces/` again after that directory is replaced or made late.

## 0.22.0

- The UI kit left the shell and has its own name, `babavoss/kit`. In a surface's `ui/index.tsx`, components (`Button`, `Alert`, `Empty…`, `Dialog…`, `Popover…`, `Tooltip…`, `ToggleGroup…`, `Command…`, `Trace…`, `CodeBlock…`, `Thread…`, `Composer`, `Message…`, `Bubble…`, `MessageScroller…`, `InputGroup…`), layouts (`Plain`, `Workbench`, `Welcome`, `MenuBar`) and the workbench parts (`Workbench*`, `Dismiss`, `useNarrow` and their types) now import from `babavoss/kit/index.ts` instead of `babavoss/shell/ui/index.ts`.
- `useTab`, `useLive`, `TabProvider`, `read`, `call`, `changes` and `Shell` stay at `babavoss/shell/ui/index.ts`.
- `<Workbench>` now takes `address` and `util` props: pass them from `useTab()`.
- Paths into `babavoss/shell/ui/components/…` or `…/layouts/…` become `babavoss/kit/components/…` and `babavoss/kit/layouts/…`. A stylesheet that imported `babavoss/shell/ui/styles.css` for the design language alone imports `babavoss/kit/styles.css`; the root's page is unchanged.

## 0.21.3

- A call into a broken tab is now refused with why it is broken. The core adds a view's string fact `broken` to the "not offered" refusal, and any surface may use that fact at any path.
- A broken tab's reason now says what is known: the kept state could not be restored, the surface fails on the kept state but not on a fresh one (close the tab or fix the code), or it fails on a fresh one too (fix the code; closing will not help).
- A path a tab's surface cannot show no longer breaks the whole tab: reading it returns `{ at, broken }` with what failed there, and the rest of the tab works.
- `open` is refused, and no tab is made, when the surface fails in `init`, `start` or its view at `/`. An always-open util that cannot init is listed as a broken tab and is made again at the next restore.

## 0.21.2

- What the root tells the agent of `/`, in the hook and in the "changed" part of an answer, now names who made each change: `changed by the person:`, `changed by the surface:` for a command's event, or a combination such as `changed by the person and you:`. A change of no known cause, such as code loaded again, stays under `changed:`.
- What only the agent's own calls changed is no longer told back to it, including calls made by a `-e` program. Such changes do not end a `wait`.
- The hook's lead line no longer guesses that the person may have acted. It says: "What changed in the root of .baba/ at / since this session was last answered, by who changed it:".
- The skill baba now says that a surface is shared and live, that the person's moves are to be taken up and never undone, and that where the person changed something first, their change stands. A surface's own `how` need not say so again.
- `Running` has a new `cause()` that gives who made the last commit and whether it was a call. Anything that implements `Running` by hand must add it.

## 0.21.1

- A tab whose surface throws on the state it keeps, for example after the surface's code changed, no longer breaks the root. `/` lists it with `broken` saying why, in place of `title` and `facts`, and keeps `close` offered. Reading the tab says the same, calls into it are refused, and its page shows the reason. A surface that changes the shape of its model should still give a `restore` that takes the earlier shape.
- The session's command is installed again where it was still the one from before 0.21.0, whose programs were given `role` and not `root`.

## 0.21.0

- What the agent works with is a surface, no longer an app. A project's surfaces are code in its `.baba/` directory: a Bun package that names the framework, `"babavoss": "github:alanremarc/babavoss#v0.21.0"`, with one directory per surface under `surfaces/`.
- A surface is two files: `src/surface.ts` default-exports the surface, and `ui/index.tsx` the component shown in its tab. It has no door, no page of its own, no runtime of its own, no skill and no file of instructions.
- `.baba/` has a root, with or without surfaces: one runtime and one page for the session, which the framework provides. Its first tab is the picker, which lists the surfaces with what each says it is for; each surface is a tab of it, opened by the agent or by the person, as often as wanted.
- An agent learns a surface from the surface alone: its `description` is how the picker lists it, and how it is worked is what its views say. The template's `how`, a fact at `/`, is the place for what always holds.
- The root follows `.baba/` by itself: a surface made or removed, and a change to one's code, are loaded into the running root. Nothing is provisioned for a surface.
- The package has a command, `baba`. `baba init` makes `.baba/` in a directory, installs the framework and provisions; `baba new NAME` makes a surface from the template; `baba start` starts the root; `baba provision` configures the harness beside `.baba/`.
- Provisioning writes the framework's hook into Claude Code's `.claude/settings.json`, for SessionStart, UserPromptSubmit and PostToolUse, beside the person's own settings and hooks, and one skill, baba, into `.claude/skills/baba` and `.agents/skills/baba`. Installing in `.baba/` provisions. baba is no longer installed with `bunx skills add`.
- The hook adds context and blocks nothing. At a session's start it gives baba's words and starts the root, whose answer is the framework's version, the page's address, the surfaces and the open tabs. With the person's message and after a tool call it gives what changed since the session was last answered, such as what the person did on the page. The skill baba is the same words, for a harness without hooks.
- A new page address is now told with: open it in the harness's browser if it has one, and otherwise give it to the person.
- The root's door says when a later babavoss is out, with the command that takes it. The repository is asked at most once a day.
- What the root's sessions write is kept beside `.baba/`: in `~/.babavoss/` for one in the person's home, in the project's `.babavoss/` otherwise.
- In a program run with the word's `-e`, the root is `root`: `root.read`, `root.call`, `root.wait`.
- Gone, until the design settles: the authoring app with its build, promptware and playground utils, the agent launcher and the harness adapters, scenarios, the references, the payments example.
- To move an app from 0.20.0: run `bunx github:alanremarc/babavoss init` in the project; move the app's `src/`, `ui/` and `spec/` into `.baba/surfaces/NAME/`; export its util's surface as the default of `src/surface.ts` and its util's component as the default of `ui/index.tsx`; give the surface a `description` that says what it does and when to use it, and say in its views what its SKILL.md said of working it; delete its door, its page's own index.html, main.tsx and styles.css, its package.json, tsconfig.json, SKILL.md and its installed copies among the skills.

## 0.20.0

- The version follows on from the framework's earlier releases on npm, which ended at 0.19.1; the product had been 0.2.0. The framework is no longer released to npm.
- The skill is named baba; babavoss is the framework. Install the skill with `bunx skills add alanremarc/babavoss`; its command is `baba`.
- An app no longer holds a copy of the framework. It names a release of it in its package.json, `"babavoss": "github:alanremarc/babavoss#v0.20.0"`, and imports it as `babavoss/core/…` and `babavoss/shell/…`.
- An app's door installs what the app depends on before it first opens, and says so only when that fails: what to allow, and how to install by hand.
- The framework an app depends on follows this skill: a new app names this skill's version, and this skill says once when an app it works on names an older one.
- The page's packages are installed by the door, no longer when the page is first asked for.
- To move an app from 0.2.0: delete its `framework/`, replace the `imports` entry in its package.json with `"babavoss": "github:alanremarc/babavoss#v0.20.0"` under `dependencies`, name what its page imports there too (react, react-dom), write `babavoss/` for `#babavoss/` in its imports and stylesheet, and take scripts/open.ts from the template.

## 0.2.0

- A build tab is open from the start. The agent writes the app's brief there before any code, asks what only the person can decide, and waits for the person to approve the brief on the page. The app is then made from the template with one action, and its page runs before the first step is built.
- A project's own apps live in `skills/NAME`. Build makes a new app there and installs it in the project by links from `.claude/skills` and `.agents/skills`.
- The template is a shell app of one util that is always open. Its page shows the surface and offers one decision; it has no form.
- In a shell, the agent is told at `/` what changes in any tab, paths named under `at` are given whole, and a util can be always open.
- An action can be declared an ask, offered to the person only.
- agent-config is now promptware: a list of the description, SKILL.md, the open answer and the references, in the order they reach the agent, with the one in view rendered beside it.
- A running app loads a change in its code in place: the process, its address and the person's open page stay, and code that does not load leaves the code before it running. An open page loads again by itself when the page's own code changes.
- A runtime that was asleep wakes at the address its session last had.
- A shell page has one stylesheet, the app's; the build says so when it is missing.
- The authoring app lists a folder as an app only where it has both SKILL.md and scripts/open.ts.
- An app that still holds the 0.1.0 framework runs as before: it ends when its code changes and is woken by the next call. To take the new behaviour, replace its `framework/` with this version's and adapt the app, as the start reference says. In a shell app, what a wrapper did to sum up tabs at `/`, give paths whole or open a util at the start, the shell now does.

## 0.1.0

The first public version.
