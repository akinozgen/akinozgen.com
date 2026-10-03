# R2'ye yükleme: anahtarlar r2.env'den okunur, ekrana basılmaz. Kullanım: r2.py deneme | r2.py yukle
import os, sys, boto3, mimetypes
env = dict(l.strip().split("=", 1) for l in open(os.path.join(os.path.dirname(__file__), "r2.env")) if "=" in l)
s3 = boto3.client("s3", endpoint_url=env["R2_ENDPOINT"], aws_access_key_id=env["R2_KEY"], aws_secret_access_key=env["R2_SECRET"], region_name="auto")
B, ON = "belediye-sesler", "belediye/"
if sys.argv[1] == "deneme":
    s3.put_object(Bucket=B, Key=ON + "deneme.txt", Body=b"ses deposu calisiyor\n", ContentType="text/plain")
    print("yüklendi")
elif sys.argv[1] == "yukle":
    var = set()
    for sayfa in s3.get_paginator("list_objects_v2").paginate(Bucket=B, Prefix=ON):
        var |= {o["Key"] for o in sayfa.get("Contents", [])}
    n = 0
    for f in sorted(os.listdir("cikti")):
        k = ON + f
        if f.endswith(".opus") and k in var: continue  # adı içeriğinin özeti: aynı adlı dosya aynıdır
        tip = "audio/ogg" if f.endswith(".opus") else "application/json"
        cache = "public, max-age=31536000, immutable" if f.endswith(".opus") else "public, max-age=300"
        s3.upload_file(f"cikti/{f}", B, k, ExtraArgs={"ContentType": tip, "CacheControl": cache}); n += 1
    print(n, "dosya yüklendi,", len(var), "zaten vardı")
