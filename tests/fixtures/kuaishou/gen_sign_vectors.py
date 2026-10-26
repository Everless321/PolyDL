#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""用 /tmp/KuaiShou-Spider 的纯算实现生成签名对拍向量。"""

from __future__ import annotations

import json
import math
import sys
import types
from pathlib import Path

ROOT = Path("/tmp/KuaiShou-Spider")
sys.path.insert(0, str(ROOT))

# builder.params -> ks_util 在导入时会碰 requests；向量生成不发网络。
if "requests" not in sys.modules:
    requests_mod = types.ModuleType("requests")
    urllib3_mod = types.ModuleType("urllib3")
    urllib3_mod.disable_warnings = lambda *args, **kwargs: None  # type: ignore[attr-defined]
    packages_mod = types.ModuleType("requests.packages")
    packages_mod.urllib3 = urllib3_mod  # type: ignore[attr-defined]
    requests_mod.packages = packages_mod  # type: ignore[attr-defined]
    sys.modules["requests"] = requests_mod
    sys.modules["requests.packages"] = packages_mod
    sys.modules["requests.packages.urllib3"] = urllib3_mod

from builder.params import Params, axios_encode  # noqa: E402
from utils.sign.falcon_pure import (  # noqa: E402
    CAVER,
    CP_PROJECT_INFO,
    CP_SIG4_INTERFACES,
    DEFAULT_SCRIPTS_LEN,
    DEFAULT_SECS_STACK,
    LIVE_URL_MAP,
    LOGIN_SIG4_INTERFACES,
    SDK_VERSION_DEFAULT,
    SDK_VERSION_LIVE,
    SIG4_WHITELIST,
    HxFalconSigner,
    blake_hex,
    build_sign_input,
    chacha,
    cp_need_sign,
    device_prefix,
    live_need_sign,
    live_sign_url,
    login_need_sign,
    need_sign,
    serialize_sign_input,
)
from utils.sign.jsval import (  # noqa: E402
    encode_uri,
    encode_uri_component,
    js_json_stringify,
    js_number_to_string,
    js_sorted,
    js_to_string,
)
from utils.sign.kww_pure import (  # noqa: E402
    HREF_CP,
    HREF_LIVE,
    HREF_WWW,
    PRODUCT_NAME_CP,
    PRODUCT_NAME_LIVE,
    PRODUCT_NAME_WWW,
    build_kwfv1,
    build_kwscode,
    looks_like_shell,
    weapon_encrypt,
)
from utils.sign.sig3_pure import (  # noqa: E402
    SIG3_SAMPLES,
    Sig3Signer,
    decode_sig3,
    need_sig3,
    parse_query,
    request2_md5,
    sig3_digest,
)

OUT = Path(__file__).with_name("sign-vectors.json")

NOW = 1735689700456  # > 2^32，锁住 now ^ mask 的高位
NOW_EDGE = 4294967301  # 2^32 + 5
RAND = 123456789012345
RAND_MAX = 281474976710655  # 2^48 - 1
STARTUP = 1735689600123


def num_case(value):
    if isinstance(value, float) and math.isnan(value):
        return {"nan": True, "expected": js_number_to_string(value)}
    if isinstance(value, float) and math.isinf(value):
        return {"inf": 1 if value > 0 else -1, "expected": js_number_to_string(value)}
    if isinstance(value, float) and value == 0 and math.copysign(1.0, value) < 0:
        return {"negZero": True, "expected": js_number_to_string(value)}
    if isinstance(value, int) and not isinstance(value, bool) and abs(value) > 2**53:
        return {"intString": str(value), "expected": js_number_to_string(value)}
    return {"value": value, "expected": js_number_to_string(value)}


def jsval_section():
    numbers = [
        0, -0.0, 1, -1, 1.0, 2.5, -0.5, 0.1, 1e21, 1e-6, 1e-7, 1e-8, 1.5e-7,
        2147483647, 4294967295, 9007199254740991, 9007199254740993,
        1.2345678901234568e29, 123456.789, 1e300, 5e-324, 100, 20,
        0.1 + 0.2, 1e16, 1e15, 1e20, 1e-4, 1e-5, math.pi, float("nan"),
        float("inf"), float("-inf"),
    ]
    strings = [
        None, True, False, "", "a", [1, 2], [1, None, 2], [[1, 2], 3], [], {}, [{}],
        "中文😀",
    ]
    json_values = [
        {"b": 1, "2": 2, "a": 3, "10": 4, "1": 5, "01": 6, "-1": 7},
        {"pcursor": 2.5, "k-1": 20, "0": "#hash"},
        {"x": 1.0, "y": 1e-7, "z": [1.0, None]},
        {"s": "中文😀", "t": 'a"b\\c\nd'},
        {"u": "\u0001\u2028行"},
        [1, None, False, 0.1 + 0.2],
        "plain",
        None,
        True,
    ]
    uri_values = [
        "[object Object]", "a b", "中文", "a/b?c=d&e=f", "#hash", "'\"\\", "😀",
        "a+b", ":", "$", ",", "[", "]", " ", "~", "!*()'", "\n", "@/",
        "HUDR_$HE_abc",
    ]
    sort_input = ["😀key", "\uf000key", "𝄞clef", "\ue000tail", "a", "z"]
    return {
        "numbers": [num_case(v) for v in numbers],
        "strings": [{"value": v, "expected": js_to_string(v)} for v in strings],
        "json": [{"value": v, "expected": js_json_stringify(v)} for v in json_values],
        "sorted": [{"value": sort_input, "expected": js_sorted(sort_input)}],
        "encodeUri": [{"value": v, "expected": encode_uri(v)} for v in uri_values],
        "encodeUriComponent": [
            {"value": v, "expected": encode_uri_component(v)} for v in uri_values
        ],
    }


def hx_case(spec, signer_kwargs=None):
    signer_kwargs = dict(signer_kwargs or {})
    signer_kwargs.setdefault("startup_random", STARTUP)
    signer_kwargs.setdefault("count", 100)
    signer_kwargs.setdefault("guard_count", 100)
    signer_kwargs.setdefault("scripts_len", DEFAULT_SCRIPTS_LEN)
    signer_kwargs.setdefault("sdk_version", SDK_VERSION_DEFAULT)
    path = spec["path"]
    method = spec.get("method", "POST")
    query = spec.get("query")
    body = spec.get("body", None)
    content_type = spec.get("contentType", "application/json")
    project_info = spec.get("projectInfo")
    omit = spec.get("omitEmptyBody", False)
    now_ms = spec.get("nowMs", NOW)
    rand48 = spec.get("rand48", RAND)
    sign_input = build_sign_input(
        path, method, query, body, content_type, project_info, omit_empty_body=omit,
    )
    signer = HxFalconSigner(**signer_kwargs)
    return {
        "path": path,
        "method": method,
        "query": query,
        "body": body,
        "contentType": content_type,
        "projectInfo": project_info,
        "omitEmptyBody": omit,
        "startupRandom": signer_kwargs["startup_random"],
        "count": signer_kwargs["count"],
        "guardCount": signer_kwargs["guard_count"],
        "scriptsLen": signer_kwargs["scripts_len"],
        "secsStack": signer_kwargs.get("secs_stack"),
        "sdkVersion": signer_kwargs["sdk_version"],
        "nowMs": now_ms,
        "rand48": rand48,
        "expectedSerialize": serialize_sign_input(sign_input),
        "expected": signer._encode(sign_input, now_ms, rand48),
    }


def hxfalcon_section():
    base_query = {
        "user_id": "3xabc",
        "count": 20,
        "pcursor": 2.5,
        "photoId": "中文😀",
        "liked": True,
        "muted": False,
        "empty": None,
        "ratio": 1.5e-7,
        "fuzzy": 0.1 + 0.2,
        "tags": [1, None, "二"],
        "extra": {"id": 1},
        "__NS_hxfalcon": "should-skip",
        "k-1": "a b",
    }
    json_body = {
        "page": "profile",
        "caption": "你好😀\"\\",
        "1": 5,
        "10": 4,
        "2": 2,
        "nested": {"b": 1, "a": [None, False, 1.0]},
        "flag": True,
    }
    cases = []
    www_paths = [
        "/rest/v/profile/get",
        "/rest/v/profile/user/v2",
        "/rest/v/search/user",
        "/rest/v/search/feed",
        "/rest/v/profile/feed",
        "/rest/v/feed/hot",
        "/rest/v/feed/liked",
        "/rest/v/collect/list",
        "/rest/v/profile/private/list",
    ]
    for i, path in enumerate(www_paths):
        cases.append(hx_case({
            "path": path,
            "method": "POST" if i % 2 == 0 else "GET",
            "query": {"page": i, "k": "v"} if i % 3 else None,
            "body": json_body if i % 2 == 0 else None,
            "contentType": "application/json",
            "omitEmptyBody": True,
            "nowMs": NOW + i,
            "rand48": RAND + i,
        }, {"count": 100 + i, "guard_count": 100 + i}))

    cases.append(hx_case({
        "path": "/rest/v/profile/get",
        "method": "POST",
        "query": base_query,
        "body": json.dumps(json_body, ensure_ascii=False),
        "contentType": "application/json; charset=UTF-8",
        "omitEmptyBody": True,
    }))
    cases.append(hx_case({
        "path": "/rest/v/profile/feed",
        "method": "POST",
        "query": {},
        "body": "not-json",
        "contentType": "Application/JSON",
        "omitEmptyBody": True,
        "nowMs": NOW_EDGE,
        "rand48": RAND_MAX,
    }, {"startup_random": RAND_MAX, "count": 0, "guard_count": 0}))
    cases.append(hx_case({
        "path": "https://www.kuaishou.com/rest/v/profile/get?foo=1",
        "method": "GET",
        "query": {"x": 1},
        "body": None,
        "omitEmptyBody": True,
    }))
    cases.append(hx_case({
        "path": "https://id.kuaishou.com/pass/kuaishou/login/mobileCode",
        "method": "POST",
        "query": None,
        "body": {"mobile": "13800138000", "code": "中文"},
        "contentType": "application/x-www-form-urlencoded",
        "omitEmptyBody": False,
        "nowMs": NOW_EDGE,
    }, {"count": 250, "guard_count": 80}))
    cases.append(hx_case({
        "path": "/rest/v/feed/hot?page=1",
        "method": "GET",
        "query": {"page": "1"},
        "omitEmptyBody": True,
        "body": "{}",
        "contentType": "application/json",
    }))
    cases.append(hx_case({
        "path": "/rest/v/search/feed",
        "method": "POST",
        "query": {"keyword": "快手"},
        "body": "[]",
        "contentType": "application/json",
        "omitEmptyBody": True,
    }))
    cases.append(hx_case({
        "path": "/rest/v/profile/get",
        "method": "POST",
        "body": "0",
        "contentType": "application/json",
        "omitEmptyBody": True,
    }))
    cases.append(hx_case({
        "path": "/rest/v/profile/get",
        "method": "POST",
        "body": "false",
        "contentType": "application/json",
        "omitEmptyBody": False,
    }))

    live_specs = [
        ("/rest/k/live/websocket/info", {"liveStreamId": "abc"}, None),
        ("/rest/k/photo/comment/list", {"count": 10, "page": 1, "pcursor": "", "photoId": "p"}, None),
        ("/rest/k/live/like", {"liveStreamId": "9"}, {"count": 1}),
        ("/rest/k/user/info", None, None),
    ]
    for path, query, body in live_specs:
        cases.append(hx_case({
            "path": path,
            "method": "GET" if body is None else "POST",
            "query": query,
            "body": body,
            "contentType": "application/json",
            "omitEmptyBody": False,
            "nowMs": NOW,
            "rand48": 99,
        }, {"sdk_version": SDK_VERSION_LIVE, "count": 130, "guard_count": 130}))

    login_bodies = [
        {"sid": "kuaishou.server.web", "channelType": "PC_PAGE", "isWebSig4": "true"},
        {"qrLoginToken": "tok", "qrLoginSignature": "sig", "channelType": "PC_PAGE", "isWebSig4": "true"},
        {"mobile": "+8613800138000", "mobileCountryCode": "+86", "type": "53"},
    ]
    login_paths = [
        "/rest/c/infra/ks/qr/start",
        "/rest/c/infra/ks/qr/scanResult",
        "/pass/kuaishou/sms/requestMobileCode",
    ]
    for path, body in zip(login_paths, login_bodies):
        cases.append(hx_case({
            "path": path,
            "method": "POST",
            "query": {},
            "body": body,
            "contentType": "application/x-www-form-urlencoded",
            "omitEmptyBody": False,
        }, {"count": 140, "guard_count": 141}))

    cases.append(hx_case({
        "path": "/pass/kuaishou/login/qr/callback",
        "method": "POST",
        "query": {"from": "live"},
        "body": json.dumps({"qrToken": "中文"}, ensure_ascii=False),
        "contentType": "application/json",
        "omitEmptyBody": False,
    }))

    cases.append(hx_case({
        "path": "/rest/cp/works/v2/video/pc/submit",
        "method": "POST",
        "query": {"kpn": "KUAISHOU_VISION"},
        "body": {"caption": "发布😀", "photoId": 42},
        "contentType": "application/json",
        "projectInfo": dict(CP_PROJECT_INFO),
        "omitEmptyBody": True,
        "nowMs": NOW,
        "rand48": RAND,
    }, {"count": 160, "guard_count": 160}))
    cases.append(hx_case({
        "path": "https://cp.kuaishou.com/rest/cp/works/v2/common/pc/nearby?x=1",
        "method": "POST",
        "query": None,
        "body": None,
        "projectInfo": dict(CP_PROJECT_INFO),
        "omitEmptyBody": True,
    }, {"sdk_version": SDK_VERSION_DEFAULT}))

    cases.append(hx_case({
        "path": "/rest/v/profile/get",
        "method": "GET",
        "query": {"n": 1},
        "omitEmptyBody": True,
        "secsNote": True,
    }, {
        "scripts_len": 7,
        "secs_stack": "中😀",
        "count": 3,
        "guard_count": 9,
        "startup_random": 1000,
    }))
    # scripts_len >= 2^32 时 _le 固定吐 4 个 0xFF
    cases.append(hx_case({
        "path": "/rest/v/feed/hot",
        "method": "GET",
        "omitEmptyBody": True,
        "nowMs": NOW,
        "rand48": 1,
    }, {"scripts_len": 4294967296, "guard_count": 4294967295, "count": 4294967295}))

    extra = [
        {"path": "/rest/cp/works/v2/video/pc/edit/info", "method": "POST",
         "body": {"photoId": "1"}, "projectInfo": dict(CP_PROJECT_INFO), "omitEmptyBody": True},
        {"path": "/rest/zt/location/wi/poi/search", "method": "POST",
         "query": {"keyword": "北京"}, "body": {"page": 1}, "projectInfo": dict(CP_PROJECT_INFO),
         "omitEmptyBody": True, "nowMs": NOW_EDGE, "rand48": 42},
        {"path": "/rest/cp/works/v2/common/pc/ip2poi", "method": "GET",
         "omitEmptyBody": True, "projectInfo": dict(CP_PROJECT_INFO)},
        {"path": "/pass/kuaishou/login/mobileCode", "method": "POST",
         "body": {"mobile": "13900000000", "code": "2468"},
         "contentType": "application/x-www-form-urlencoded", "omitEmptyBody": False},
        {"path": "/pass/bid/web/sns/quickLoginByKsAuth", "method": "POST",
         "body": {"code": "abc"}, "contentType": "application/x-www-form-urlencoded",
         "omitEmptyBody": False, "nowMs": NOW, "rand48": RAND_MAX},
        {"path": "/rest/k/playback/product/list", "method": "GET",
         "query": {"authorId": "9", "page": "2"}, "omitEmptyBody": False,
         "sdkLive": True},
        {"path": "/rest/wd/live/liveStream/status", "method": "GET",
         "query": {"liveStreamId": "ls"}, "omitEmptyBody": False, "sdkLive": True,
         "nowMs": NOW_EDGE},
        {"path": "/rest/v/profile/user/v2", "method": "POST",
         "contentType": "multipart/form-data", "body": {"file": "x"},
         "omitEmptyBody": False},
        {"path": "/rest/v/profile/get", "method": "POST", "body": "\"hello\"",
         "contentType": "application/json", "omitEmptyBody": True, "rand48": 0, "nowMs": 0},
        {"path": "/rest/v/search/user", "method": "GET",
         "query": {"user": "name", "page": 0, "ok": False}, "omitEmptyBody": True,
         "startupNote": True},
    ]
    for i, spec in enumerate(extra):
        sdk_live = spec.pop("sdkLive", False)
        spec.pop("startupNote", None)
        cases.append(hx_case(spec, {
            "sdk_version": SDK_VERSION_LIVE if sdk_live else SDK_VERSION_DEFAULT,
            "count": 300 + i,
            "guard_count": 300 + i,
            "startup_random": 42 if i == len(extra) - 1 else STARTUP,
        }))

    sequential = []
    seq_signer = HxFalconSigner(startup_random=STARTUP, count=100, guard_count=100)
    seq_calls = [
        {"path": "/rest/v/profile/get", "method": "GET", "query": {"a": 1}, "body": None,
         "contentType": "application/json", "omitEmptyBody": True, "nowMs": NOW, "rand48": 11},
        {"path": "/rest/v/profile/feed", "method": "POST", "query": {"b": "二"},
         "body": {"p": "cursor"}, "contentType": "application/json", "omitEmptyBody": True,
         "nowMs": NOW + 5, "rand48": 22},
        {"path": "/rest/v/search/user", "method": "POST", "query": None,
         "body": {"keyword": "快手"}, "contentType": "application/json", "omitEmptyBody": True,
         "nowMs": NOW_EDGE, "rand48": RAND_MAX},
        {"path": "/rest/v/feed/liked", "method": "GET", "query": {"page": 3}, "body": "",
         "contentType": "application/json", "omitEmptyBody": True, "nowMs": 1000, "rand48": 0},
        {"path": "/rest/v/collect/list", "method": "POST", "query": {"x": None},
         "body": {"flag": False, "n": 0}, "contentType": "application/json",
         "omitEmptyBody": True, "nowMs": NOW, "rand48": 7},
    ]
    calls = []
    for spec in seq_calls:
        sign_input = build_sign_input(
            spec["path"], spec["method"], spec["query"], spec["body"], spec["contentType"],
            None, omit_empty_body=spec["omitEmptyBody"],
        )
        calls.append({
            **spec,
            "projectInfo": None,
            "expectedSerialize": serialize_sign_input(sign_input),
            "expected": seq_signer._encode(sign_input, spec["nowMs"], spec["rand48"]),
        })
    sequential.append({
        "startupRandom": STARTUP,
        "count": 100,
        "guardCount": 100,
        "scriptsLen": DEFAULT_SCRIPTS_LEN,
        "secsStack": None,
        "sdkVersion": SDK_VERSION_DEFAULT,
        "calls": calls,
        "expectedCount": seq_signer.count,
        "expectedGuard": seq_signer.guard_count,
    })

    live_signer = HxFalconSigner(
        startup_random=STARTUP, count=200, guard_count=200, sdk_version=SDK_VERSION_LIVE,
    )
    live_calls_src = [
        {"path": "/rest/k/live/websocket/info", "method": "GET",
         "query": {"liveStreamId": "s1"}, "body": None, "contentType": "application/json",
         "omitEmptyBody": False, "nowMs": NOW, "rand48": 3},
        {"path": "/rest/k/live/like", "method": "POST", "query": {"liveStreamId": "s1"},
         "body": {"c": 1}, "contentType": "application/json", "omitEmptyBody": False,
         "nowMs": NOW + 9, "rand48": 4},
        {"path": "/rest/k/photo/comment/list", "method": "GET",
         "query": {"photoId": "中", "count": 20}, "body": None,
         "contentType": "application/json", "omitEmptyBody": False,
         "nowMs": NOW_EDGE, "rand48": 5},
    ]
    live_calls = []
    for spec in live_calls_src:
        sign_input = build_sign_input(
            spec["path"], spec["method"], spec["query"], spec["body"], spec["contentType"],
            None, omit_empty_body=False,
        )
        live_calls.append({
            **spec,
            "projectInfo": None,
            "expectedSerialize": serialize_sign_input(sign_input),
            "expected": live_signer._encode(sign_input, spec["nowMs"], spec["rand48"]),
        })
    sequential.append({
        "startupRandom": STARTUP,
        "count": 200,
        "guardCount": 200,
        "scriptsLen": DEFAULT_SCRIPTS_LEN,
        "secsStack": None,
        "sdkVersion": SDK_VERSION_LIVE,
        "calls": live_calls,
        "expectedCount": live_signer.count,
        "expectedGuard": live_signer.guard_count,
    })
    return {"cases": cases, "sequential": sequential}


def primitives_section():
    texts = ["", "hello", "中文😀", "a" * 300, "/rest/v/profile/getcaver=2"]
    blobs = [
        b"",
        b"\x00\x01\x02",
        bytes(range(64)),
        bytes((i * 7 + 3) & 0xFF for i in range(80)),
        "快手".encode("utf-8"),
    ]
    prefixes = [
        {"scriptsLen": DEFAULT_SCRIPTS_LEN, "guardCount": 100,
         "secsStack": DEFAULT_SECS_STACK, "secsCount": 100},
        {"scriptsLen": 0, "guardCount": 0, "secsStack": "", "secsCount": 0},
        {"scriptsLen": 7, "guardCount": 256, "secsStack": "中😀", "secsCount": 3},
        {"scriptsLen": 4294967296, "guardCount": 1, "secsStack": "ab", "secsCount": 2},
    ]
    return {
        "blake": [{"text": t, "expected": blake_hex(t)} for t in texts],
        "chacha": [
            {"inputHex": blob.hex(), "expectedHex": chacha(blob).hex()} for blob in blobs
        ],
        "devicePrefix": [
            {**item, "expected": device_prefix(
                item["scriptsLen"], item["guardCount"], item["secsStack"], item["secsCount"],
            )}
            for item in prefixes
        ],
    }


def sig3_section():
    samples = []
    for api, sig in SIG3_SAMPLES.items():
        info = decode_sig3(sig)
        samples.append({
            "api": api,
            "sig": sig,
            "plainHex": info["plain"].hex(),
            "startupRandom": info["startup_random_int"],
            "count": info["count_int"],
            "digestHex": info["digest"].hex(),
            "build": info["build_int"],
            "checksumOk": info["checksum_ok"],
            "magicHex": info["magic"].hex(),
            "versionHex": info["version"].hex(),
            "flagsHex": info["flags"].hex(),
        })

    digests = []
    for text in ["", "abc", "中文", json.dumps({"a": 1}, ensure_ascii=False)]:
        import hashlib
        md5 = hashlib.md5(text.encode("utf-8")).hexdigest()
        digests.append({"md5": md5, "expectedHex": sig3_digest(md5).hex()})

    md5_cases = [
        {"query": {}, "body": {}, "type": "json"},
        {"query": {"b": "2", "a": "1"}, "body": {"caption": "你好😀", "1": 5, "10": 1}, "type": "json"},
        {"query": {"z": "尾"}, "body": {"mobile": "+86", "type": "53"}, "type": "form-data"},
        {"query": None, "body": None, "type": "json"},
        {"query": {"k": "a b/c"}, "body": [1, None, {"x": False}], "type": "json"},
        {"query": parse_query("https://cp.kuaishou.com/rest/cp/a?b=%E4%B8%AD&c=&d"),
         "body": {"api_ph": "ph"}, "type": "json"},
    ]
    md5_out = []
    for item in md5_cases:
        md5 = request2_md5(item["query"], item["body"], item["type"])
        md5_out.append({
            "query": item["query"],
            "body": item["body"],
            "type": item["type"],
            "expected": md5,
            "digestHex": sig3_digest(md5).hex(),
        })

    signer = Sig3Signer(1786175710, 116)
    calls = []
    for item in (
        {"query": {}, "body": {}, "type": "json"},
        {"query": {"a": "1"}, "body": {"b": "中文"}, "type": "json"},
        {"query": {}, "body": {"sid": "x", "n": 2}, "type": "form-data"},
        {"query": {"pcursor": "2.5"}, "body": {"ok": True, "s": "a\"b"}, "type": "json"},
    ):
        calls.append({
            **item,
            "expectedMd5": request2_md5(item["query"], item["body"], item["type"]),
            "expected": signer.sign(item),
        })
    return {
        "samples": samples,
        "digests": digests,
        "md5": md5_out,
        "sequential": {
            "startupRandom": 1786175710,
            "count": 116,
            "calls": calls,
            "expectedCount": signer.count,
        },
        "parseQuery": [
            {"url": url, "expected": parse_query(url)}
            for url in (
                "/rest/cp/a",
                "/rest/cp/a?b=1&c=",
                "https://cp.kuaishou.com/rest/cp/a?q=%E4%B8%AD%E6%96%87&x=a%3Db&y",
                "https://cp.kuaishou.com/rest/cp/a?b=1?c=2",
                "?=1&k=v",
                "",
            )
        ],
    }


def kww_section():
    weapons = [
        {"plain": "", "key": "webweaponconfigs"},
        {"plain": "hello", "key": "K8wm5PvY9nX7qJc2"},
        {"plain": "中文😀|did|PCLive|1786809590431|goG2elf1", "key": "H4tL6rNd3vB9xM5k"},
        {"plain": "x" * 40, "key": "webweaponconfigs"},
    ]
    kwfv1 = [
        {"href": HREF_WWW, "did": "web_abc", "productName": PRODUCT_NAME_WWW,
         "nowMs": 1786809590431, "nonce": "goG2elf1"},
        {"href": HREF_CP, "did": "web_cp", "productName": PRODUCT_NAME_CP,
         "nowMs": 1700000000000, "nonce": "Ab12Cd34"},
        {"href": HREF_LIVE, "did": "", "productName": PRODUCT_NAME_LIVE,
         "nowMs": 1600000000000, "nonce": "zzzzzzzz"},
    ]
    kwscode = [
        {"href": HREF_WWW, "secToken": "0123456789abcdefTOKEN", "did": "web_abc",
         "productName": PRODUCT_NAME_WWW, "nowMs": 1786809590431},
        {"href": HREF_LIVE, "secToken": "short", "did": "d",
         "productName": PRODUCT_NAME_LIVE, "nowMs": 123},
    ]
    shells = []
    for plain, key in (("hello", "K8wm5PvY9nX7qJc2"),):
        shells.append(weapon_encrypt(plain, key))
    return {
        "weapon": [
            {**item, "expected": weapon_encrypt(item["plain"], item["key"])} for item in weapons
        ],
        "kwfv1": [
            {**item, "expected": build_kwfv1(
                item["href"], item["did"], item["productName"], item["nowMs"], item["nonce"],
            )}
            for item in kwfv1
        ],
        "kwscode": [
            {**item, "expected": build_kwscode(
                item["href"], item["secToken"], item["did"], item["productName"], item["nowMs"],
            )}
            for item in kwscode
        ],
        "looksLikeShell": [
            {"value": "", "tag": "F"},
            {"value": "abc", "tag": "F"},
            {"value": "K1234WxxxxxFyy", "tag": "F"},
            {"value": "K1234WxxxxxSyy", "tag": "S"},
            {"value": "K1234WxxxxxSyy", "tag": "F"},
            {"value": "a" * 64, "tag": "F"},
        ],
    }


def decorate_shells(section):
    for item in section["looksLikeShell"]:
        item["expected"] = looks_like_shell(item["value"], item["tag"])
    # 真实外壳也测一遍
    for item in section["kwfv1"]:
        section["looksLikeShell"].append({
            "value": item["expected"], "tag": "F",
            "expected": looks_like_shell(item["expected"], "F"),
        })
    for item in section["kwscode"]:
        section["looksLikeShell"].append({
            "value": item["expected"], "tag": "S",
            "expected": looks_like_shell(item["expected"], "S"),
        })
    return section


def axios_section():
    singles = [
        "a b", "HUDR_xxx$HE_yyy", "中文", ":$,[]", "a+b", 1, 1.5, True, False, None,
        [1, None, 2], {"z": 1}, "😀", "",
    ]
    rows = [
        [("a", "b c"), ("__NS_hxfalcon", "HUDR_x$HE_y"), ("n", 1), ("flag", True),
         ("q", None), ("arr", [1, None, 2]), ("obj", {"z": 1}), ("ch", "中文"),
         ("plus", "a+b"), ("sym", ":$,[]")],
        [("kpn", "KUAISHOU_VISION"), ("caver", "2")],
        [],
    ]
    encoded_rows = []
    for pairs in rows:
        params = Params()
        for key, value in pairs:
            params.add_param(key, value)
        encoded_rows.append({
            "pairs": [{"key": k, "value": v} for k, v in pairs],
            "expected": params.to_query_string(),
        })
    return {
        "values": [{"value": v, "expected": axios_encode(v)} for v in singles],
        "query": encoded_rows,
    }


def flags_section():
    need = [(p, True) for p in SIG4_WHITELIST] + [
        ("/rest/v/profile/get/extra", False),
        ("/live_api/comment/list", False),
        ("", False),
    ]
    live_urls = list(LIVE_URL_MAP) + ["/live_api/comment/list?x=1", "/live_api/nope", ""]
    login_urls = list(LOGIN_SIG4_INTERFACES) + [
        "/rest/c/infra/ks/qr/start?x=1",
        "/pass/kuaishou/pc/pageInfo",
        "",
    ]
    cp_urls = [
        "/rest/cp/works/v2/video/pc/submit",
        "https://cp.kuaishou.com/rest/cp/works/v2/common/pc/nearby?x=1",
        "/rest/cp/works/v2/video/pc/edit/info",
        "/rest/zt/location/wi/poi/search",
        "/foo/rest/cp/works/v2/common/pc/ip2poi",
        "/rest/cp/works/v2/common/pc/current/user",
        "/rest/v2/creator/foo",
        "",
    ]
    sig3_urls = cp_urls + ["/rest/kd/a", "rest/v2/creator/x", "/rest/cp/works/v2/video/pc/submit"]
    return {
        "needSign": [{"url": u, "expected": need_sign(u)} for u, _expected in need],
        "liveNeedSign": [{"url": u, "expected": live_need_sign(u)} for u in live_urls],
        "liveSignUrl": [{"url": u, "expected": live_sign_url(u)} for u in live_urls],
        "loginNeedSign": [{"url": u, "expected": login_need_sign(u)} for u in login_urls],
        "cpNeedSign": [{"url": u, "expected": cp_need_sign(u)} for u in cp_urls],
        "needSig3": [{"url": u, "expected": need_sig3(u)} for u in sig3_urls],
        "whitelist": {
            "sig4": list(SIG4_WHITELIST),
            "login": list(LOGIN_SIG4_INTERFACES),
            "cp": list(CP_SIG4_INTERFACES),
            "live": LIVE_URL_MAP,
        },
    }


def main():
    hx = hxfalcon_section()
    payload = {
        "defaults": {
            "caver": CAVER,
            "sdkVersion": SDK_VERSION_DEFAULT,
            "sdkVersionLive": SDK_VERSION_LIVE,
            "scriptsLen": DEFAULT_SCRIPTS_LEN,
            "secsStack": DEFAULT_SECS_STACK,
            "projectInfo": CP_PROJECT_INFO,
        },
        "jsval": jsval_section(),
        "primitives": primitives_section(),
        "hxfalcon": hx,
        "sig3": sig3_section(),
        "kww": decorate_shells(kww_section()),
        "axios": axios_section(),
        "flags": flags_section(),
    }
    payload["meta"] = {
        "hxfalconCases": len(hx["cases"]) + sum(len(g["calls"]) for g in hx["sequential"]),
        "sig3Calls": len(payload["sig3"]["sequential"]["calls"]),
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {OUT} hxfalcon={payload['meta']['hxfalconCases']}")


if __name__ == "__main__":
    main()
