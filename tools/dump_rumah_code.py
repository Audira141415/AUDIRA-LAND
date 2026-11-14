with open('F:/AUDIRA-INTEGRASI-BLEDER-ROBLOX/AUDIRA-LAND/tools/scraped_netizenia/app.dbbd84e3f1.js', 'r', encoding='utf-8') as f:
    text = f.read()

pos1 = text.find('CAT.rumah.m=')
pos2 = text.find('CAT.rumah2.m=')
pos3 = text.find('CAT.kos.m=')

print("=== CAT.rumah.m ===")
print(text[pos1:pos2])

print("\n=== CAT.rumah2.m ===")
print(text[pos2:pos3])

