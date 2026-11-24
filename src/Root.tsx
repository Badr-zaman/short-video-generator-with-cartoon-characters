import React from "react";
import { Composition, staticFile } from "remotion";
import { Short } from "./Short";
import type { EpisodeProps, ShortProps } from "./types";

export const Root: React.FC = () => (
  <Composition
    id="Short"
    component={Short}
    width={1080}
    height={1920}
    fps={30}
    durationInFrames={300}
    defaultProps={{ episode: null } as ShortProps}
    calculateMetadata={async ({ props }) => {
      let episode = props.episode;
      if (!episode) {
        // Studio preview: show whatever `npm run prepare-ep` produced last.
        try {
          const r = await fetch(staticFile("generated/latest.json"));
          if (r.ok) episode = (await r.json()) as EpisodeProps;
        } catch {
          /* nothing prepared yet */
        }
      }
      return episode ? { props: { episode }, durationInFrames: episode.durationInFrames, fps: episode.fps } : {};
    }}
  />
);
