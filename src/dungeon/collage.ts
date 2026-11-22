import Phaser from 'phaser';

export const COLLAGE_FONT = '"Memory Serif", "Noto Serif KR", serif';

// Text stays live and legible; only its backing has torn edges and off-register ink.
export class PaperLabel extends Phaser.GameObjects.Container {
  private backing: Phaser.GameObjects.Graphics;
  private lettering: Phaser.GameObjects.Text;
  constructor(scene: Phaser.Scene, x: number, y: number, text: string, size = 16) {
    super(scene, x, y);
    this.backing = scene.add.graphics();
    this.lettering = scene.add.text(0, 0, text, {
      fontFamily: COLLAGE_FONT, fontSize: `${size}px`, color: '#352b25',
      padding: { x: 12, y: 7 },
    }).setOrigin(.5);
    this.add([this.backing, this.lettering]);
    scene.add.existing(this);
    this.redraw();
  }
  private redraw() {
    const w = this.lettering.width / 2, h = this.lettering.height / 2;
    const points = [{ x: -w, y: -h+3 }, { x: -w+17, y: -h }, { x: w-10, y: -h+2 },
      { x: w, y: -h+6 }, { x: w-2, y: h-3 }, { x: w-15, y: h }, { x: -w+6, y: h-2 }];
    this.backing.clear().fillStyle(0x30231d, .24).fillPoints(points.map(p=>({x:p.x+3,y:p.y+3})), true);
    this.backing.fillStyle(0xe0d0ae, .96).fillPoints(points, true);
    this.backing.lineStyle(1,0x8a6c52,.65).strokePoints(points,true);
    this.backing.lineStyle(1,0x943b3e,.45).lineBetween(-w+8,h-5,w-8,h-6);
  }
  setText(text: string) { if(this.lettering.text !== text) { this.lettering.setText(text); this.redraw(); } return this; }
  setColor(color: string) { if(this.lettering.style.color !== color) this.lettering.setColor(color); return this; }
}

export function cutoutWord(scene: Phaser.Scene, text: string, x: number, y: number, color: string) {
  const group = scene.add.container(x,y);
  const widths = [...text].map(c=>c===' '?15:39);
  let cursor = -widths.reduce((a,b)=>a+b,0)/2;
  [...text].forEach((glyph,i)=>{
    const width=widths[i];
    if(glyph!==' ') {
      const piece=scene.add.container(cursor+width/2,i%2?3:-2).setAngle(i%2?7:-6);
      const paper=scene.add.image(0,0,'art-paper').setDisplaySize(47,59).setTint(i%2?0xc7bb9d:0xf0dfb9);
      const style={fontFamily:COLLAGE_FONT,fontSize:'35px',fontStyle:'bold'};
      const bleed=scene.add.text(1.7,1.5,glyph,{...style,color:'#913b3c'}).setOrigin(.5).setAlpha(.45);
      const ink=scene.add.text(0,0,glyph,{...style,color}).setOrigin(.5);
      piece.add([paper,bleed,ink]);group.add(piece);
    }
    cursor+=width;
  });
  return group;
}
