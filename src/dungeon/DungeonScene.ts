import Phaser from 'phaser';
import { direction, objectAvailable, safePosition } from './model';
import type { DungeonData, DungeonProgress, DungeonObject, Point, EnemyType } from './model';

export interface DungeonBridge {
  read: () => DungeonProgress;
  paused: () => boolean;
  interact: (object: DungeonObject, position: Point) => void;
  hit: (enemyId: string, position: Point, now: number) => void;
  nearby: (object: DungeonObject | null) => void;
  checkpoint: (position: Point) => void;
  sound: (cue: 'door' | 'hit' | 'inspect') => void;
}
interface EnemyRuntime { id: string; type: EnemyType; body: Phaser.Physics.Arcade.Image; label: Phaser.GameObjects.Text; shadow: Phaser.GameObjects.Text; home: Point; patrol: Point; reverse: boolean; state: 'patrol' | 'windup' | 'charge' | 'rest'; until: number; vector: Point }
export class DungeonScene extends Phaser.Scene {
  private dataDef: DungeonData;
  private bridge: DungeonBridge;
  private roomId = '';
  private player!: Phaser.Physics.Arcade.Image;
  private doll!: Phaser.GameObjects.Image;
  private shadow!: Phaser.GameObjects.Ellipse;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private enemies: EnemyRuntime[] = [];
  private marks: { object: DungeonObject; image: Phaser.GameObjects.Image | Phaser.GameObjects.Container; label: Phaser.GameObjects.Text; blocker?: Phaser.GameObjects.Rectangle }[] = [];
  private lastNearby: string | null = null;
  private elapsed = 0;
  private transitioning = false;
  private reduced = false;
  constructor(data: DungeonData, bridge: DungeonBridge) { super('MindDungeon'); this.dataDef = data; this.bridge = bridge; }
  preload() {
    for(const key of ['paper','scrap','eye','bell','letter','traveler']) if(!this.textures.exists(key)) this.load.image(key,`/assets/dungeon/${key}.svg`);
    const room=this.dataDef.rooms.find(r=>r.id===this.bridge.read().roomId)!;
    if(room.backgroundImage && !this.textures.exists(`art-${room.id}`)) this.load.image(`art-${room.id}`,room.backgroundImage);
  }
  create() {
    const progress=this.bridge.read();
    const room=this.dataDef.rooms.find(r=>r.id===progress.roomId)!;
    this.physics.world.isPaused=false;this.tweens.timeScale=1;
    this.roomId=room.id;this.enemies=[];this.marks=[];this.lastNearby=null;this.elapsed=0;this.transitioning=false;
    this.reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ink=Phaser.Display.Color.HexStringToColor(room.palette[0]).color, red=Phaser.Display.Color.HexStringToColor(room.palette[1]).color;
    this.cameras.main.setBackgroundColor(ink);
    this.physics.world.setBounds(44,44,room.width-88,room.height-88);
    this.cameras.main.setBounds(0,0,room.width,room.height);
    const hasArtwork=!!room.backgroundImage && this.textures.exists(`art-${room.id}`);
    if(hasArtwork) {
      // World-space art keeps the painted bell aligned with its interaction point as the camera moves.
      this.add.image(0,0,`art-${room.id}`).setOrigin(0).setDisplaySize(room.width,room.height).setDepth(-10);
    } else {
    this.add.tileSprite(0,0,room.width*2,room.height*2,'paper').setOrigin(0).setTint(0xc0b59c).setScrollFactor(.85).setDepth(-10);
    // Deliberately mismatched layers: torn archival sheets, ink engravings, red cutouts.
    const backdrop=this.add.graphics().setDepth(-8).setScrollFactor(.92);
    backdrop.fillStyle(ink,.9);backdrop.fillPoints([{x:0,y:0},{x:room.width,y:0},{x:room.width,y:140},{x:1050,y:85},{x:680,y:150},{x:300,y:90},{x:0,y:145}],true);
    backdrop.fillStyle(red,.8);backdrop.fillPoints([{x:0,y:room.height-115},{x:350,y:room.height-170},{x:900,y:room.height-70},{x:room.width,y:room.height-145},{x:room.width,y:room.height},{x:0,y:room.height}],true);
    for(let i=0;i<18;i++) {
      this.add.rectangle(i*100,36,75,75,i%2===0?0xd8c9aa:0x29252b).setAngle(i%2===0?12:-9).setDepth(-5);
      this.add.text(i*100,34,i%3===0?'III':'∴',{fontFamily:'Georgia',fontSize:'35px',color:i%2===0?'#8b2640':'#d2b68e'}).setOrigin(.5).setDepth(-4);
    }
    const eye=this.add.image(room.width*.58,105,'eye').setDisplaySize(430,225).setAngle(-9).setAlpha(.7).setScrollFactor(.75).setDepth(-3);
    if(!this.reduced)this.tweens.add({targets:eye,angle:-5,y:117,duration:4300,yoyo:true,repeat:-1});
    for(let i=0;i<9;i++) {
      const scrap=this.add.image(210+(i*191)%1300,200+(i*157)%650,'scrap').setDisplaySize(175+i%3*40,100+i%3*30).setAngle(-25+i*7).setAlpha(.2).setDepth(-6);
      if(!this.reduced)this.tweens.add({targets:scrap,angle:scrap.angle+3,duration:3500+i*170,yoyo:true,repeat:-1});
    }
    room.whispers.forEach((text,i)=>{
      const t=this.add.text(320+i*390,165+i*280,text,{fontFamily:'serif',fontSize:`${23+i*4}px`,color:room.palette[0],fontStyle:'bold'}).setAlpha(.27).setAngle(i%2?8:-12).setScrollFactor(.94).setDepth(-2);
      if(!this.reduced)this.tweens.add({targets:t,x:t.x+25,duration:5000+i*700,yoyo:true,repeat:-1});
    });
    }
    const walls=this.physics.add.staticGroup();
    room.obstacles.forEach((o,i)=>{
      const solid=this.add.rectangle(o.x+o.w/2,o.y+o.h/2,o.w,o.h,ink).setStrokeStyle(4,0x9c3150).setDepth(3);
      walls.add(solid);
      this.add.image(o.x+o.w/2,o.y+o.h/2,'scrap').setDisplaySize(o.w-12,o.h-12).setTint(0x84776b).setDepth(4);
      this.add.text(o.x+o.w/2,o.y+o.h/2,i%2?'欠落':'封',{fontSize:'46px',fontFamily:'serif',color:'#241d29'}).setOrigin(.5).setDepth(5);
    });
    if(!this.textures.exists('body-dot')) { const g=this.make.graphics({x:0,y:0});g.fillStyle(0xffffff);g.fillCircle(18,18,18);g.generateTexture('body-dot',36,36);g.destroy(); }
    const p=safePosition(progress.position,room);
    this.player=this.physics.add.image(p.x,p.y,'body-dot').setAlpha(0).setCircle(18).setCollideWorldBounds(true);
    this.physics.add.collider(this.player,walls);
    this.shadow=this.add.ellipse(p.x,p.y+4,42,17,0x17121e,.45).setDepth(19);
    this.doll=this.add.image(p.x,p.y-25,'traveler').setDisplaySize(47,70).setDepth(20);
    this.cameras.main.startFollow(this.player,true,.13,.13);
    room.objects.forEach(o=>{
      let image: Phaser.GameObjects.Image | Phaser.GameObjects.Container;
      let blocker: Phaser.GameObjects.Rectangle | undefined;
      if(o.kind==='door') {
        image=this.add.container(o.x,o.y);
        const rim=this.add.rectangle(0,0,70,145,0x171923).setStrokeStyle(5,red);
        const portal=this.add.rectangle(0,0,48,120,0x548f83,.6);
        const cross=this.add.text(0,0,'×',{fontSize:'55px',color:'#e5c8ac'}).setOrigin(.5);
        image.add([rim,portal,cross]);
        blocker=this.add.rectangle(o.x,o.y,60,130,0,0);
        this.physics.add.existing(blocker,true);this.physics.add.collider(this.player,blocker);
      } else if(o.kind==='core' && hasArtwork) {
        // The painted bell is the actual scene centerpiece; do not draw a second placeholder bell.
        const anchor=this.add.container(o.x,o.y);
        const thread=this.add.graphics().lineStyle(2,0xa63649,.75);
        thread.lineBetween(0,-180,0,-26);
        const ring=this.add.ellipse(0,0,72,26,0x291c22,.35).setStrokeStyle(2,0xe9c783,.95);
        anchor.add([thread,ring]);image=anchor;
        if(!this.reduced)this.tweens.add({targets:ring,alpha:.45,duration:1400,yoyo:true,repeat:-1});
      } else if(o.kind==='core') {
        image=this.add.image(o.x,o.y-70,'bell').setDisplaySize(230,300);
        this.add.ellipse(o.x,o.y+50,240,65,0x24202f,.5).setDepth(2);
        if(!this.reduced)this.tweens.add({targets:image,y:image.y-12,angle:3,duration:2700,yoyo:true,repeat:-1});
      } else {
        image=this.add.image(o.x,o.y,o.kind==='fragment'?'letter':'scrap').setDisplaySize(o.kind==='fragment'?80:100,o.kind==='fragment'?60:76).setAngle(o.kind==='puzzle'?-5:7);
        if(!this.reduced)this.tweens.add({targets:image,angle:image.angle+3,duration:2400,yoyo:true,repeat:-1});
      }
      image.setDepth(8);
      const label=this.add.text(o.x,o.y+(o.kind==='core'?105:83),o.title,{fontFamily:'serif',fontSize:'15px',color:'#e9d8b7',backgroundColor:'#252332',padding:{x:9,y:5}}).setOrigin(.5).setDepth(9);
      this.marks.push({object:o,image,label,blocker});
    });
    for(const spawn of room.enemies) {
      const type=this.dataDef.enemyTypes.find(e=>e.id===spawn.typeId)!;
      const body=this.physics.add.image(spawn.x,spawn.y,'body-dot').setDisplaySize(type.radius*2,type.radius*2).setAlpha(0).setCollideWorldBounds(true);
      const shadow=this.add.text(spawn.x+5,spawn.y+4,type.text,{fontFamily:'serif',fontSize:'45px',color:'#981e3d',fontStyle:'bold'}).setOrigin(.5).setDepth(12);
      const label=this.add.text(spawn.x,spawn.y,type.text,{fontFamily:'serif',fontSize:'43px',color:type.behavior==='chase'?'#9b1839':'#211c28',stroke:'#d1b39a',strokeThickness:1,fontStyle:'bold'}).setOrigin(.5).setDepth(13);
      const e:EnemyRuntime={id:spawn.id,type,body,label,shadow,home:{x:spawn.x,y:spawn.y},patrol:spawn.patrol,reverse:false,state:'patrol',until:0,vector:{x:0,y:0}};
      this.enemies.push(e);this.physics.add.collider(body,walls);
      this.physics.add.overlap(this.player,body,()=>{
        if(this.bridge.paused() || this.transitioning)return;
        const before=this.bridge.read().stability;
        this.bridge.hit(e.id,this.position(),Date.now());
        if(this.bridge.read().stability<before) { e.state='rest';e.until=this.elapsed+type.cooldownMs;this.bridge.sound('hit');if(!this.reduced)this.cameras.main.shake(130,.004); }
      });
    }
    this.keys=this.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,E',false) as Record<string,Phaser.Input.Keyboard.Key>;
    const reset=()=>this.input.keyboard?.resetKeys();
    this.game.events.on(Phaser.Core.Events.BLUR,reset);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN,()=>{this.game.events.off(Phaser.Core.Events.BLUR,reset);this.bridge.nearby(null);});
    this.cameras.main.fadeIn(this.reduced?0:400,15,13,23);
  }
  position(): Point { return this.player ? {x:this.player.x,y:this.player.y} : this.bridge.read().position; }
  update(_time:number,delta:number) {
    if(!this.player)return;
    const progress=this.bridge.read();
    if(progress.roomId!==this.roomId) {
      if(!this.transitioning) { this.transitioning=true;this.player.setVelocity(0);this.bridge.sound('door');this.cameras.main.fadeOut(this.reduced?1:220,15,13,23);this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE,()=>this.scene.restart()); }
      return;
    }
    const paused=this.bridge.paused() || this.transitioning;
    this.physics.world.isPaused=paused;
    this.tweens.timeScale=paused?0:1;
    if(paused){this.player.setVelocity(0);this.input.keyboard?.resetKeys();return;}
    this.elapsed+=Math.min(delta,50);
    const key=(name:string)=>this.keys[name]?.isDown?1:0;
    const v=direction(key('D')+key('RIGHT')-key('A')-key('LEFT'),key('S')+key('DOWN')-key('W')-key('UP'),this.dataDef.rules.playerSpeed);
    this.player.setVelocity(v.x,v.y);
    this.shadow.setPosition(this.player.x,this.player.y+7);
    this.doll.setPosition(this.player.x,this.player.y-25).setAngle(this.reduced||!Math.hypot(v.x,v.y)?0:Math.sin(this.elapsed/90)*3);
    this.doll.setAlpha(Date.now()-progress.lastHitAt<this.dataDef.rules.immunityMs ? .55 : 1);
    const candidates=this.marks.filter(m=>m.object.kind!=='fragment'||!progress.fragments.includes(m.object.fragmentId!));
    const near=candidates.sort((a,b)=>Phaser.Math.Distance.Between(this.player.x,this.player.y,a.object.x,a.object.y)-Phaser.Math.Distance.Between(this.player.x,this.player.y,b.object.x,b.object.y)).find(m=>Phaser.Math.Distance.Between(this.player.x,this.player.y,m.object.x,m.object.y)<=this.dataDef.rules.interactionRadius);
    for(const m of this.marks) {
      const available=objectAvailable(progress,m.object), collected=m.object.fragmentId && progress.fragments.includes(m.object.fragmentId);
      m.image.setAlpha(collected ? .3 : available ? 1 : .45);
      m.label.setText(collected?'획득한 기억':m.object.kind==='door'?(available?'열린 문 · E':'잠긴 문'):m.object.title);
      m.label.setColor(near===m?'#f8db80':'#d9c6ac');
      if(m.blocker) { (m.blocker.body as Phaser.Physics.Arcade.StaticBody).enable=!available;const cross=(m.image as Phaser.GameObjects.Container).getAt(2) as Phaser.GameObjects.Text;cross.setVisible(!available); }
    }
    if((near?.object.id??null)!==this.lastNearby){this.lastNearby=near?.object.id??null;this.bridge.nearby(near?.object??null);}
    if(near&&Phaser.Input.Keyboard.JustDown(this.keys.E)){this.bridge.checkpoint(this.position());this.bridge.sound('inspect');this.bridge.interact(near.object,this.position());return;}
    for(const e of this.enemies) {
      const distance=Phaser.Math.Distance.Between(this.player.x,this.player.y,e.body.x,e.body.y);
      let velocity={x:0,y:0};
      if(e.state==='rest') { if(this.elapsed>=e.until)e.state='patrol'; }
      else if(e.state==='windup') { if(this.elapsed>=e.until){e.state='charge';e.until=this.elapsed+e.type.chargeMs;e.vector=direction(this.player.x-e.body.x,this.player.y-e.body.y,e.type.speed*3.6);} }
      else if(e.state==='charge') { velocity=e.vector;if(this.elapsed>=e.until){e.state='rest';e.until=this.elapsed+e.type.cooldownMs;velocity={x:0,y:0};} }
      else if(e.type.behavior==='charge'&&distance<e.type.detection) { e.state='windup';e.until=this.elapsed+e.type.windupMs; }
      else {
        let target=e.reverse?e.home:e.patrol;
        if(e.type.behavior==='chase'&&distance<e.type.detection)target=this.player;
        else if(Phaser.Math.Distance.Between(e.body.x,e.body.y,target.x,target.y)<20)e.reverse=!e.reverse;
        velocity=direction(target.x-e.body.x,target.y-e.body.y,e.type.speed);
      }
      e.body.setVelocity(velocity.x,velocity.y);
      const shake=this.reduced?0:Math.sin(this.elapsed/65+e.home.x)*2;
      e.label.setAlpha(e.state==='windup'&&!this.reduced ? .55+.45*Math.abs(Math.sin(this.elapsed/100)) : 1);
      e.label.setPosition(e.body.x+shake,e.body.y).setScale(e.state==='windup'?1.35:distance<e.type.detection?1.1:1).setAngle(shake);
      e.shadow.setPosition(e.body.x+(e.state==='charge'?17:4),e.body.y+4).setScale(e.state==='windup'?1.4:1);
    }
  }
}
