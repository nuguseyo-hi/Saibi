/** Receive keys at the focused stage, before React's root bubbling handlers.
 * Phaser captures gameplay keys after processing them, preventing page scroll.
 * Menu/form inputs elsewhere must never feed the game keyboard.
 */
export function stageInput(target: HTMLElement) {
 return {keyboard:{target}};
}
