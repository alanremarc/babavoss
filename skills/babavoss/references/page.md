# Design a page

The person changes things by telling the agent. The page is where they see what is true and make the decisions that are theirs: approve, pick one of several, answer an ask. Build it for inspection. Do not build a form or an editor for what the person can say in chat; where they must name things in chat, show the names and numbers to say.

State the page's job in one sentence. List what the person needs to see, which decision each fact supports, and what they decide there. Remove elements that serve none of those purposes.

Render the surface's views and call its offered handles. The page has no separate domain decisions or operation status. Keep navigation, layout and private drafts on the page; if a draft or choice must reach the agent, write it through a handle into the model. Reading a path alone is navigation, not a call that changes state.

Make one thing central in each view. Show state where it applies, including pending work, asks and failures. Offer a control only where pointing or picking is quicker than saying it. Show a refusal's reason. Keep empty views useful by saying what to ask the agent for.

## Shell

Use the shell's design language, theming, layouts and components before making custom parts. Import it through #babavoss/shell/*. A util is one workflow or job, with its own surface, component and icon. Split independent jobs; keep views of the same thing together.

Home at / lists utils and open tabs. A util opens as a tab at /tabs/N, with its surface beneath that path. A util made with `{ open: "always" }` has one tab from the start, neither opened again nor closed, and a page opened at / lands in it: use it for a job the app always has. Use the paths and handles the current view offers; do not assume a tab number. Pass the page's address to the person whenever the app names a new one.

The page has one stylesheet, ui/styles.css, imported by its entry; it imports the shell's and names the app's own files as sources. The shell brings no styles of its own.

A util's component reads and calls below its own tab with `useTab` and `useLive`, in the util's own paths: `/` is the util's root.

Choose the layout for the job:

- Workbench: tools find, one document shows; the person arranges tools around the open documents.
- Plain: a header and a page for a single list or configuration.
- Welcome: scopes to choose before opening one, such as a project or repository.

Every layout has the header and a menu bar with the util's menus and the layout's controls. Keep component-specific details with the components in the framework; use the copy this app holds rather than guessing interfaces. A part another util needs belongs in the shell; contribute its fix upstream through [Start](start.md).

## Verify

Open the page fresh and check the current view. You cannot see the page: say so, and ask the person to look and tell you what is off. Call a handle through bv and confirm the page follows it. Make a call as the person and inspect the next answer for its change. Check that the page remains useful in a narrow window and that asks can be answered. The page opens only when the person follows the address you give them. Try the complete task in the [playground](playground.md).
