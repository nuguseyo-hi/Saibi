"""Build the bundled Korean storybook face from Debian's OFL Noto Serif CJK.
Requires fontTools; uses WOFF (zlib) so no Brotli dependency is needed.
"""
from pathlib import Path
from fontTools import subset
from fontTools.ttLib import TTFont
font = TTFont('/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc', fontNumber=1)
options = subset.Options()
options.flavor = 'woff'
subsetter = subset.Subsetter(options=options)
ranges = [(0x20,0x7e),(0x1100,0x11ff),(0x2000,0x206f),(0x2190,0x21ff),(0x25a0,0x25ff),(0x3000,0x303f),(0x3130,0x318f),(0xac00,0xd7a3)]
subsetter.populate(unicodes=[c for lo,hi in ranges for c in range(lo,hi+1)])
subsetter.subset(font)
for record in font['name'].names:
    names = {1:'Memory Serif',2:'Regular',3:'MemorySerif-Regular-1',4:'Memory Serif Regular',6:'MemorySerif-Regular',16:'Memory Serif',17:'Regular'}
    if record.nameID in names:
        record.string = names[record.nameID].encode(record.getEncoding())
font.flavor='woff'
font.save(Path(__file__).resolve().parents[1] / 'public/assets/fonts/memory-serif.woff')
