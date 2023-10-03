"use strict";exports.withCookies=e=>{e.cookies=(e.headers.get("Cookie")||"").split(/;\s*/).map((e=>e.split(/=(.+)/))).reduce(((e,[s,i])=>i?(e[s]=i,e):e),{})};
