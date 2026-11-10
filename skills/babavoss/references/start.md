# Start an app

Start with the assets/template beside this app's SKILL.md. Copy its contents into the new app's directory and copy the authoring app's framework/ there as real files. The app holds its own copy; it imports the framework through #babavoss/* and the shell through #babavoss/shell/*.

Give the app one name and a description. Its version is the semantic version in package.json, set by hand. Its one entry is scripts/open.ts. Replace the template's name consistently in its skill, README, CHANGELOG, package.json and src/app.ts. Keep SKILL.md at the root; put further know-how in references beside it.

Write the skill to the agent. Its description says what the app does and when to use it, as a phrase and a "use when", never a sentence about the skill. Add `compatibility: Requires Bun 1.4 or later` to its frontmatter. Keep the template's opening and its "Operating it" section as they are: they are the same in every app, and they are what the agent knows before its first command. Under them write the app's own part: the order of the work, who decides what, and when not to act, which is the judgement the surface cannot express. What is mechanical belongs in the surface: what an input may be, in the handle's description and in the view that offers it; what must be waited for, as a fact. In a playground trace, a refusal, or a read that led to no action, is something the skill or the surface should have said. Exact commands come from the door's answer; never write them into the skill. Do not assume the agent has these authoring references.

Design the [surface](surface.md) first and the [page](page.md) where needed. The template's spec/app.spec.ts is the app's first story: replace it with one test per rule as you write each rule, and run them with `bun test`. Keep the door and bv as the agent's way to operate the app. An app uses its harness's skills and shell; it imports no harness adapter.

Open the authoring app in the project. Inspect the description, skill text and open answer in agent-config after changing promptware or the root view. It shows the description, skill body without frontmatter, references and open answer, with character counts and token estimates of one token per four characters; the open answer is computed by running the app's own cli. Keep the text sufficient for the work and small enough to read each time.

Write a [scenario](playground.md) for the first task and try it with the person. Confirm that open gives the whole view and page address, a call through bv changes the page, and a person call appears in the next answer.

Put the app’s directory among the harness’s skills to install it. Install babavoss itself with `bunx skills add alanremarc/babavoss -g`. Update it with `bunx skills update babavoss`. An app is updated by replacing its directory: when it opens at a newer version than it last did, its door says so once and points to the app’s CHANGELOG.md, so write there, newest first, what each version changed for the person and the agent.

Each app holds its own framework/ copied from the authoring app, including the shell where used. Changing the authoring app does not replace another app’s copy. When changing that copy, preserve local fixes and adapt the app to the framework it takes. Verify its saved state, skill, open answer and scenarios again.

Contribute a framework fix upstream as a pull request to the babavoss repository, under skills/babavoss/framework. Carry the same fix and its verification there so other apps can take it.

Check an app with `bun check` and `bun test`; it needs no other tool. Write its code in the framework's style, which no tool enforces: no semicolons; double quotes; lines up to 160 columns; an object, array or call that fits on one line stays on one line; trailing commas where a list spans lines; a blank line before a return, and before and after a group of const and let declarations; no `any`; every file opens with a comment that says what it is for.
