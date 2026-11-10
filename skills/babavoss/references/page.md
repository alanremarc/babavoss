# Design a page

Give the person a page where they have something to see or do. State its job in one sentence. List what they need to see, which decision each fact supports, and what they need to do there. Remove elements that serve none of those purposes.

Render the surface's views and call its offered handles. The page has no separate domain decisions or operation status. Keep navigation, layout and private drafts on the page; if a draft or choice must reach the agent, write it through a handle into the model. Reading a path alone is navigation, not a call that changes state.

Make one thing central in each view. Show state where it applies, including pending work, asks and failures. Offer precise controls where pointing or picking helps the person. Show a refusal's reason. Keep empty views useful by saying what to ask the agent for.

## Shell

Use the shell's design language, theming, layouts and components before making custom parts. Import it through #babavoss/shell/*. A util is one workflow or job, with its own surface, component and icon. Split independent jobs; keep views of the same thing together.

Home at / lists utils and open tabs. A util opens as a tab at /tabs/N, with its surface beneath that path. Use the paths and handles the current view offers; do not assume a tab number. Pass the page's address to the person whenever the app names a new one.

Choose the layout for the job:

- Workbench: tools find, one document shows; the person arranges tools around the open documents.
- Plain: a header and a page for a single list or configuration.
- Welcome: scopes to choose before opening one, such as a project or repository.

Every layout has the header and a menu bar with the util's menus and the layout's controls. Keep component-specific details with the components in the framework; use the copy this app holds rather than guessing interfaces. A part another util needs belongs in the shell; contribute its fix upstream through [Start](start.md).

## Verify

Open the page fresh and check the current view. Call a handle through bv and confirm the page follows it. Make a call as the person and inspect the next answer for its change. Check that the page remains useful in a narrow window and that asks can be answered. The page opens only when the person follows the address you give them. Try the complete task in the [playground](playground.md).
