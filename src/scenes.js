// -----------------------------------------------------------------------------
// Scene action handlers (manifest `scene_actions`, Gladys 5.1+).
//
// On, brightness, colour and white are already Gladys scene actions on the
// light features. This one starts what only WiZ knows, its built-in scenes,
// with their brightness and speed in one step.
//
// The trigger (`switched_outside_gladys`) is fired by the hub (src/hub.js),
// never as a consequence of this action: a scene bound to it would loop.
// -----------------------------------------------------------------------------

import { sceneName } from './wiz/scenes.js';

export const SCENE_ACTIONS = {
  async start_scene(hub, { fields }) {
    const scene = await hub.startScene(fields.device, {
      scene: fields.scene,
      brightness: fields.brightness,
      speed: fields.speed,
    });
    return { scene_id: scene.id, scene_name: sceneName(scene, hub.config.language) };
  },
};
