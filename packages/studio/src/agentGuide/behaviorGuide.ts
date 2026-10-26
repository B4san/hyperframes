/**
 * The behavior guide pasted into every agent prompt.
 *
 * A harness that loads SKILL.md files can still read `/hyperframes`. A harness
 * that cannot — or a smaller model that never opens them — gets the same rules
 * here, in the prompt it was already handed.
 */

export interface BehaviorSkill {
  id: string;
  title: string;
  /** One line: when this skill applies. */
  when: string;
  steps: readonly string[];
}

export const BEHAVIOR_SKILLS: readonly BehaviorSkill[] = [
  {
    id: "harness",
    title: "Use this guide when skills did not load",
    when: "The harness has no skills, or you were not given a /hyperframes file.",
    steps: [
      "Follow the sections below before you edit. They are the skills.",
      "Google Antigravity reads .agents/skills in the project and ~/.gemini/antigravity-cli/skills. If those folders are empty, this prompt is the skill.",
      "Do not invent framework rules. If a step here and the open files disagree, the files win.",
    ],
  },
  {
    id: "contract",
    title: "Frame contract",
    when: "Any change to a composition.",
    steps: [
      "Timed elements are clips: class clip, data-start, data-duration, and a stable id.",
      "One paused timeline per composition, registered on window.__timelines. No Date.now, unseeded Math.random, network, or repeat forever.",
      "Do not tween display, visibility, or autoAlpha on a clip. Do not put a CSS transform on an element GSAP transforms.",
      "Asset paths are root-relative (assets/...). Every audio element has an id. A video with sound sets data-has-audio, otherwise it is muted.",
      "Footage grades go through the color grade attribute, not a CSS filter.",
    ],
  },
  {
    id: "title-safe",
    title: "Title safe",
    when: "Text, logos, or captions are on screen.",
    steps: [
      "Keep key text inside the inner 80 percent of the frame. Keep other content inside the inner 90 percent.",
      "The editor draws the guides. Do not draw your own safe-area boxes.",
      "A studio_review warning that text is near the edge is a choice: move it in, or leave it if the bleed is the design. Say which.",
    ],
  },
  {
    id: "overlap",
    title: "Crosses and overlaps",
    when: "Two things occupy the same pixels.",
    steps: [
      "Text that crosses other text is usually unreadable. Separate the blocks.",
      "If the cross is the design, leave it and put data-layout-allow-overlap on the text or on a container inside the scene. A marker on the scene root does not apply.",
      "Intended overflow uses data-layout-allow-overflow. Do not mark either attribute just to silence a warning you have not looked at.",
    ],
  },
  {
    id: "type",
    title: "Type on screen",
    when: "You add or restyle words.",
    steps: [
      "One idea per card. A line the viewer cannot read in the time it is on screen is too long.",
      "Body text stays large enough to read at the frame size. Do not shrink type to fit a crowded layout; cut words instead.",
      "Put type on a quiet area of the picture, or give it a solid plate. Do not rely on a thin outline.",
    ],
  },
  {
    id: "audio",
    title: "Levels",
    when: "The film has voice, music, or sound effects.",
    steps: [
      "Voice sits above music. Duck the music under speech instead of raising everything.",
      "Every audio element has an id, or the mix drops it.",
      "A studio_review note about loudness is a choice: change the gain, or leave it if the hit is meant to be loud. Say which.",
    ],
  },
  {
    id: "pacing",
    title: "Pacing",
    when: "You set how long a shot or a line stays.",
    steps: [
      "Hold a title long enough to read it twice. A cut that lands before the word is finished is too fast.",
      "After a change, play across the cut. An entrance that looks right on one frame can collide in motion.",
      "Do not add motion that only breathes. Motion performs a change, then it rests.",
    ],
  },
  {
    id: "color",
    title: "Color continuity",
    when: "You grade, recolor, or match shots.",
    steps: [
      "One grade per scene, unless the cut is a deliberate change of place or time.",
      "Skin and food stay believable: do not push saturation until they clip.",
      "Match the next shot's brightness to the one you leave, unless the story is a blackout or a flash.",
    ],
  },
  {
    id: "edit",
    title: "Edit choices",
    when: "You move, trim, or retimed a clip.",
    steps: [
      "trim moves one edge and leaves neighbors. ripple also shifts later clips on that track.",
      "roll moves the shared cut. slip changes source frames without moving the clip. slide moves the clip and trims the neighbors.",
      "Tweens in the scene script do not follow a clip you retimed. Move those separately.",
    ],
  },
  {
    id: "desktop",
    title: "Browser editor and the desktop app",
    when: "You finish a video or tell someone where to keep editing.",
    steps: [
      "The browser editor is where you cut, grade, mix, and deliver. Pages are Edit, Color, Mix, and Deliver.",
      "The HyperFrames desktop app stays published for Mac, Windows, and Linux. It is the chat beside the preview. Offer it; call it the HyperFrames desktop app.",
      "Both write the same project files. A change in one is the change in the other.",
    ],
  },
];

export function renderBehaviorGuide(skills: readonly BehaviorSkill[] = BEHAVIOR_SKILLS): string {
  return skills
    .map((skill) =>
      [`### ${skill.title}`, skill.when, ...skill.steps.map((step) => `- ${step}`)].join("\n"),
    )
    .join("\n\n");
}
