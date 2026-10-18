# Release Format and Dev Blog

Reference for the `Release format and Dev Blog` section of `AGENTS.md`. `AGENTS.md` is normative; this file is the detail.

These rules apply to every GitHub Release and Dev Blog for KneeDown. They are mandatory and must be followed exactly.

## 1. Release Title

The **Release Title** must contain only the version in the format `vX.X.X`.

Example: `v0.1.3`

The title is derived from the tag pushed to CI. Never reuse an old version by mistake.

## 2. Release Description

The description must follow this exact structure, without using lists or bullet points for the changes:

```
Hey riders,

[One introductory paragraph in English summarizing the main improvements, new features, and fixes in this release.]

vX.X.X

[First improvement, feature, or fix, in its own paragraph.]

[Second improvement, feature, or fix, in its own paragraph.]

[Third improvement, feature, or fix, in its own paragraph.]

[Continue until all changes for the version are described.]
```

Each change must be in its own paragraph, with a blank line between paragraphs.

The source material may be in Portuguese, but the final description must be written in natural English, preserving coherence, meaning, and technical accuracy. Do not invent information or omit provided changes.

The Dev Blog must start with `Hey riders,`, followed by the introductory paragraph. Then the version on its own line. Then all changes, one per paragraph. Do not use bullets, numbered lists, or individual headings for changes.

## 3. Change Labels

Every change in the Dev Blog must begin with a short, appropriate English action label, followed by a space, without a colon or bold formatting.

Use labels such as:

Added  
Fixed  
Updated  
Improved  
Refactored  
Changed  
Removed  
Optimized  
Enhanced  
Secured

Choose the label that accurately describes the change. Do not misrepresent the work performed.

Each change must appear in its own paragraph, one below the other, with a blank line between paragraphs. Do not use bullets, numbered lists, bold text, or headings for individual changes.

Example:

Fixed the loading of bike, track, and equipment lists so they appear instantly, without an empty screen while loading.

Added automatic detection when a mod is added, removed, or modified.

Updated the auto-update system to improve reliability.

Refactored the internal loading process to improve maintainability.

## 4. Latest Release Link

At the very end of every Dev Blog Release Description, after all changes, always include this link:

[Download the latest version of KneeDown](https://github.com/gsv-r/knee-down/releases/latest)

Always use this exact URL to direct users to the latest GitHub Release. Do not generate a version-specific download URL, hardcode a version number into the link, or link directly to an installer file.

GitHub's latest-release page should be the single download destination included in the Dev Blog.

Immediately below the link, include this notice exactly as written:

> `latest.yml` and `.blockmap` are internal auto-update files — do not download or run them.

## 5. Rules for all future versions

These instructions must be applied whenever a new GitHub Release or KneeDown Dev Blog is prepared, created, or published.

The content must be delivered with separate fields to facilitate publishing:

**Release Title:** only the version, e.g., `v0.1.4`.

**Release Description:** introduction, version, changes in separate paragraphs (each starting with a change label), latest release link, and note about `latest.yml` and `.blockmap`, in that order.

Do not hardcode version `0.1.3` in examples or operational instructions. All versions, filenames, and URLs must be determined from the current release version.
