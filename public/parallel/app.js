/* Parallel — no framework, no tracking, no external UI dependencies. */
'use strict';
const ICONS={
user:'<path d="M24 9.5c3.9-.1 6.4 2.4 6.4 6.2c0 3.7-2.5 6.2-6.3 6.2s-6.3-2.5-6.3-6.2s2.5-6.1 6.2-6.2M11.5 38.8c.2-7.3 5.5-12.4 12.5-12.4s12.3 5.1 12.5 12.4c-8.3.8-16.7.8-25 0"/>',
heart:'<path d="M24 39c-7-5.5-13.5-10.8-15.5-17.5c-1.5-5 1-9.5 5.5-10.3c4-.7 7.7 1.6 10 5.4c2.3-3.9 6-6.2 10-5.4c4.5.9 7 5.4 5.4 10.4c-2.1 6.7-8.5 12-15.4 17.4"/>',
sparkleheart:'<path d="M19.4 38.8c-4.8-3.7-9.2-7.3-10.6-11.9c-1-3.4.7-6.5 3.7-7.1c2.8-.4 5.3 1.2 6.9 3.7c1.5-2.6 4.1-4.2 6.8-3.7c3.1.7 4.8 3.7 3.7 7.1c-1.4 4.7-5.8 8.3-10.5 11.9M34.3 9.2c.5 1.4.7 2.8.9 4.3c1.5.1 2.9.5 4.3 1c-1.4.4-2.8.8-4.4.9c-.1 1.5-.3 2.9-.9 4.3q-.6-2.1-.9-4.2c-1.5-.2-3-.6-4.3-1.1q1.95-.75 4.2-.9c.3-1.5.6-2.9 1.1-4.3"/>',
hearts:'<path d="M18.2 37.7c-4.3-3.4-8.4-6.7-9.6-10.8c-.9-3.1.6-5.9 3.4-6.4c2.5-.5 4.8 1 6.2 3.3c1.4-2.4 3.7-3.8 6.2-3.3c2.8.5 4.3 3.3 3.3 6.4c-1.3 4.2-5.2 7.5-9.5 10.8m1.8-22c.1-2.2 1.5-3.8 3.6-4.2c2.5-.5 4.8 1 6.2 3.3c1.4-2.4 3.7-3.8 6.2-3.3c2.8.5 4.3 3.3 3.3 6.4c-.9 2.9-3.1 5.4-5.8 7.8"/>',
message:'<path d="M9 12c10-1.1 21-1 29.5 0c1.1 5.5.9 12 .1 17c-7.6 1-16.1.9-23.1.4c-2 2.6-4 4.8-6.3 6.8c.2-3.2.1-5.5-.2-7.2c-.8-5.5-.7-11.8 0-17m7.5 8.5h.01m7.09.1h.01m6.99-.1h.01"/>',
terminal:'<path d="m24.2 8.5l4.6 1.3l-.5 4.2l3.1 1.7l4.1-1.4l1.8 2.4l-2.6 3.5l.2 3.4l4.4 1.7l-.6 4.1l-4.5-.2l-2.1 2.4l2 4.1l-2.6 2.7l-3.6-3l-3.1.5l-1.3 4.6l-3.7-.7l.2-5.4l-3.8-1.6l-3.7 1.6l-2.5-2.1l3.4-3.6l-.7-3l-4-1.7l.2-4l4.3-.2l2.8-3l-2.8-3.6l3.2-2.8l3.5 4.1l3.4-.9Z"/><path d="M24 19.6c3.1-.1 5.1 1.9 5 5c-.1 3-2.1 4.9-5 4.8s-4.8-2-4.8-4.9s2-4.8 4.8-4.9"/>',
refresh:'<path d="M37.5 21.5C36.2 15 30.8 10.8 24.3 11c-5.4.2-9.9 3.4-12 8"/><path d="M31.5 21.8c2.1.1 4.1 0 6.2-.3q.45-3.15.3-6.3M10.5 26.5C11.8 33 17.2 37.2 23.7 37c5.4-.2 9.9-3.4 12-8"/><path d="M16.5 26.2c-2.1-.1-4.1 0-6.2.3q-.45 3.15-.3 6.3"/>',
plus:'<path d="M24 11c.2 8.6.2 17.3 0 26"/><path d="M11 24c8.6-.2 17.3-.2 26 0"/>',
arrow:'<path d="M9.5 24c9 .2 18.5.2 28 0"/><path d="M29 15.5c3 2.8 6 5.6 8.8 8.5c-2.8 2.9-5.8 5.7-8.8 8.5"/>',
back:'<path d="M30 12c-4 4-8 8-11.8 12C22 28 26 32 30 36"/>',
x:'<path d="M24 8.5c8.8 0 15.5 6.7 15.5 15.5S32.8 39.5 24 39.5S8.5 32.8 8.5 24S15.2 8.5 24 8.5"/><path d="M18 18.5q5.7 5.7 11.4 11.7"/><path d="M29.6 18.3c-3.9 3.9-7.8 7.8-11.5 11.9"/>',
check:'<path d="M24 8.5c8.8 0 15.5 6.7 15.5 15.5S32.8 39.5 24 39.5S8.5 32.8 8.5 24S15.2 8.5 24 8.5"/><path d="M16.5 24.5c2 2.2 3.9 4.4 5.7 6.7c3.1-4.7 6.4-9.2 9.8-13.6"/>',
camera:'<path d="M8.5 18c2.7-.5 5.5-.7 8.3-.7c.8-1.4 1.6-2.7 2.6-3.9c3-.2 6-.2 9 .1c.9 1.2 1.7 2.4 2.4 3.7c3 0 6 .3 8.8.8c.7 6.4.6 12.7-.1 18.8c-10.3 1.1-20.7 1.1-30.9 0c-.7-6.2-.8-12.5-.1-18.8"/><path d="M28 20.8c4-.1 6.5 2.4 6.4 6.3c-.1 3.8-2.7 6.2-6.4 6.1s-6.1-2.5-6.1-6.2s2.5-6.1 6.1-6.2m-14.2 1.7h.01"/>',
photo:'<path d="M8.5 12.5c10.3-.9 20.7-.8 31 0c.7 7.4.6 15.1-.1 22.3c-10.3.9-20.6.8-30.8 0c-.7-7.3-.7-15-.1-22.3"/><path d="M34.6 30.5c-2.6-3.8-5.2-7.5-8-11c-2.1 2.8-4 5.7-5.9 8.7c-1.3-1.6-2.6-3.2-4.1-4.6c-1.4 2.2-2.8 4.5-4 6.9m2.9-13.3h.01"/>',
info:'<path d="M24 8.5c8.8 0 15.5 6.7 15.5 15.5S32.8 39.5 24 39.5S8.5 32.8 8.5 24S15.2 8.5 24 8.5m0 8h.01"/><path d="M24 22.5c.1 3.5.1 6.9 0 10.3"/>',
search:'<path d="M21 9.6c6.6-.2 10.8 4.2 10.6 10.7c-.2 6.3-4.6 10.3-10.8 10.1c-6.1-.2-10.2-4.4-10.2-10.5c0-6 4.3-10.1 10.4-10.3"/><path d="M28.9 28.4c3 3 6 6.1 8.9 9.3"/>',
chevron:'<path d="M18 12c4 4 8 8 11.8 12C26 28 22 32 18 36"/>',
up:'<path d="M12 30c4-4 8-8 12-11.8C28 22 32 26 36 30"/>',
down:'<path d="M12 18c4 4 8 8 12 11.8C28 26 32 22 36 18"/>',
edit:'<path d="M10.5 37.8c1-3.2 2.1-6.1 3.5-8.8c6-7 12.3-13.6 19-19.6c1.8 1.5 3.6 3.2 5.2 5.1c-5.6 6.5-11.8 12.9-18.4 19.1q-4.5 2.55-9.3 4.2"/><path d="M29.2 13.2c1.8 1.5 3.5 3.1 5.1 4.9M12.2 34.2c.7.8 1.4 1.5 2.2 2.2"/>',
trash:'<path d="M19.5 12.6c.2-2.2 1.8-3.4 4.5-3.4s4.3 1.2 4.5 3.4m-17 .9c8.3-.8 16.7-.8 25 0m-22 5c-.2 6.8.3 13.5 1.3 19.9c.2 1.4 1.1 2.2 2.5 2.3q5.7.45 11.4 0c1.4-.1 2.3-.9 2.5-2.3c1-6.4 1.5-13.1 1.3-19.9"/><path d="M20.8 22c.1 4.5.1 9 0 13.4M27.2 22c-.1 4.5-.1 9 0 13.4"/>',
sliders:'<path d="M9.5 11c9.7-.9 19.4-.9 29 0c-4 5.6-8.1 11-12.2 16.3L26 37.8c-1.8-1-3.5-2.1-5.1-3.4c-.1-2.4-.1-4.7 0-7C17 22 13.2 16.5 9.5 11"/>',
spark:'<path d="M18.4 20.2c1 2.4 1.9 4.7 3 7c2.5.2 5 .5 7.5 1c-1.9 1.7-3.7 3.3-5.6 4.8c.6 2.5 1.1 5 1.4 7.5c-2-1.2-4.2-2.6-6.3-3.9c-2.2 1.3-4.3 2.7-6.4 3.9q.6-3.75 1.5-7.5c-1.9-1.5-3.8-3.1-5.6-4.8c2.5-.5 5-.8 7.4-1c1.1-2.3 2.1-4.6 3.1-7M32.7 7.5c.7 1.7 1.4 3.3 2.1 5c1.8.2 3.6.4 5.3.7c-1.3 1.2-2.6 2.3-4 3.5c.5 1.8.8 3.5 1.1 5.2q-2.25-1.2-4.5-2.7c-1.6 1-3.1 1.9-4.6 2.7c.3-1.7.6-3.4 1.1-5.2c-1.4-1.2-2.7-2.3-4-3.5c1.7-.3 3.5-.5 5.3-.7c.7-1.7 1.4-3.3 2.2-5"/>',
compass:'<path d="M30.8 8.1c1 2.3 1.9 4.5 2.9 6.7c2.4.3 4.8.6 7.2 1c-1.8 1.6-3.6 3.2-5.4 4.7c.6 2.4 1.1 4.7 1.4 7.1c-2-1.2-4.1-2.5-6.1-3.7c-2 1.2-4.1 2.5-6.1 3.7c.3-2.4.8-4.7 1.4-7.1c-1.8-1.5-3.6-3.1-5.4-4.7c2.4-.4 4.8-.7 7.2-1c1-2.2 1.9-4.4 2.9-6.7m-21.6 31c3.5-3.3 6.9-6.8 10.1-10.4M7.4 31.1c3.7-3.4 7.3-6.8 10.8-10.4m-1.6 19.5c2.6-2.4 5.1-4.8 7.4-7.4"/>',
shield:'<path d="M24 8.5q7.2 3.15 14.7 4.8c.2 9.6-2.8 17.5-9.2 22.9c-1.9 1.6-3.7 2.8-5.5 3.7c-1.8-.9-3.6-2.1-5.5-3.7c-6.4-5.4-9.4-13.3-9.2-22.9q7.5-1.65 14.7-4.8"/><path d="M17.5 22.5c1.7 1.8 3.3 3.6 4.8 5.5c2.7-3.6 5.5-7 8.5-10.3"/>',
clock:'<path d="M24 9v3m-8.5 8.5c.1-5 3.5-8.5 8.5-8.5s8.4 3.5 8.5 8.5c.1 4 1.1 7.5 3.5 10.3q-12 1.8-24 0c2.4-2.8 3.4-6.3 3.5-10.3m5.3 14c.6 1.9 1.7 2.8 3.2 2.8s2.6-.9 3.2-2.8"/>',
send:'<path d="M39.4 8.6c-10 3.9-19.8 8.3-29.3 13.3c-1.6.8-1.5 2.1.2 2.7c3.7 1.4 7.4 2.6 11.2 3.7c1.3 3.7 2.7 7.4 4.3 11c.7 1.6 2 1.6 2.7 0c4.1-10 7.8-20.2 10.9-30.7"/><path d="M21.8 28C27.6 21.6 33.4 15.2 39 8.9"/>',
more:'<path d="M11.8 24c-.1-1.1.7-1.6 1.5-1.3c.9.3 1.1 1.4.5 2.2c-.7.7-1.9.2-2-.9m11 0c-.1-1.1.7-1.6 1.5-1.3c.9.3 1.1 1.4.5 2.2c-.7.7-1.9.2-2-.9m11 0c-.1-1.1.7-1.6 1.5-1.3c.9.3 1.1 1.4.5 2.2c-.7.7-1.9.2-2-.9"/>',
link:'<path d="M20.5 27.5c-2.3-2.2-2.4-5.2-.2-7.5c2-2.1 4.2-4.3 6.5-6.4s5.4-2 7.6.1c2.1 2.2 2.1 5.2.1 7.4c-1.3 1.4-2.7 2.8-4.1 4.1"/><path d="M27.5 20.5c2.3 2.2 2.4 5.2.2 7.5c-2 2.1-4.2 4.3-6.5 6.4s-5.4 2-7.6-.1c-2.1-2.2-2.1-5.2-.1-7.4c1.3-1.4 2.7-2.8 4.1-4.1"/>',
book:'<path d="M14 9.5c6.6-.5 13.4-.5 19.9.1c.6 9.7.6 19.4.1 29.1c-6.5.6-13 .6-19.5.1c-.6-9.8-.6-19.5-.5-29.3"/><path d="M10.5 14.5c1.5-.1 2.9-.1 4.3 0M10.5 24c1.5-.1 2.9-.1 4.3 0m-4.3 9.5c1.5-.1 2.9-.1 4.3 0M20 18q4.5-.3 9 0m-9 6q4.5-.3 9 0"/>',
map:'<path d="M8 12.5c4.5-1.7 9-2.6 13.5-1.9c3 .5 6 1.8 9 2.1c3.1.3 6.3-.5 9.5-1.7c.6 7.6.5 15.4 0 23c-3.3 1.3-6.6 2.1-9.8 1.8c-3-.3-6-1.7-9-2.1c-4.3-.6-8.7.5-13 2.1c-.6-7.8-.6-15.6-.2-23.3"/><path d="M20.7 10.9c.3 7.5.3 15.1.2 22.5m9.5-20.5c.1 7.5 0 15.1-.1 22.5m3-17.6c1.2 1.4 2.3 2.7 3.3 4.1"/><path d="M36.8 17.5c-1.3 1.4-2.5 2.9-3.6 4.4M12 27.5h.01M15.5 24h.01"/>',
users:'<path d="M18 11.5c3.4-.1 5.6 2.1 5.6 5.5c0 3.3-2.2 5.5-5.5 5.5s-5.5-2.2-5.5-5.5s2.2-5.4 5.4-5.5m-10.5 27C7.7 32 12 27.8 18 27.8S28.3 32 28.5 38.5q-10.5 1.05-21 0m22-26.3c3.3.7 5.2 3.1 4.9 6.4c-.2 2.4-1.5 4.1-3.7 4.8m1.8 5c4.5 1.2 7.4 4.8 7.8 9.9c-2.5.4-5.1.6-7.7.6"/>',
lock:'<path d="M15 25.5c6-.7 13-.6 18.5 0c1.1 4.7 1 10.5.3 15c-6.8.9-13.3.7-19.2 0c-.8-4.8-.7-10.4.4-15"/><path d="M16.5 24.8c-.3-5.9.7-11.4 5.4-12.7s8.7 1.3 9.3 6.3c.2 2.1.3 4.3.2 6.5m-7.3 5.7h.01m-.01 4.2v2.6"/>',
warning:'<path d="M24 9.5c5.8 9.1 11.3 18.4 16.4 27.9c-5.4.9-10.9 1.3-16.4 1.3s-11-.4-16.4-1.3C12.7 27.9 18.2 18.6 24 9.5"/><path d="M24 20.5q.15 4.2 0 8.1m0 4.4h.01"/>',
usercheck:'<path d="M18.5 12c-2.3.1-4.6.3-6.6.7c-.6 8.8-.6 17.7.1 26.2q12 1.2 24 0c.7-8.5.7-17.4.1-26.2c-2-.4-4.3-.6-6.6-.7"/><path d="M19 13.5c0-2.9 2-4.7 5-4.7s5 1.7 5 4.6c-3.3.5-6.7.5-10 .1m-1.5 12c1.7 1.9 3.3 3.8 4.8 5.8c2.6-3.8 5.3-7.4 8.2-10.9"/>',
logoff:'<path d="M20 9.5c-2.8-.1-5.3 0-7.6.4q-.9 14.1 0 28.2c2.3.4 4.8.5 7.6.4m.5-14.5c5.3-.2 10.7-.2 16 0"/><path d="M30.5 17.5c2.2 2.1 4.3 4.3 6.3 6.5c-2 2.2-4.1 4.3-6.3 6.4"/>',
dog:'<path d="M22.6 30.8c.9-.1 1.7-.1 2.5.1c-.4.5-.9.8-1.5 1.1c-.5-.3-.8-.7-1-1.2m7.2-3.7c-.1.4 0 .7.2 1"/><path d="M11.8 23c-.2 1.6-.3 3.2-.2 4.9c.9 2.5 2 5 3.2 7.4c3 1 6 1.9 9.1 2.6c3.1-1.2 6.1-2.5 9.1-4c1.2-1.8 2.3-3.7 3.2-5.7c0-1.7-.2-3.5-.6-5.2"/><path d="M17.4 27.1c-.1.3 0 .6.1.8m.7-9.2q-.9.9-1.2 2.1c-.8.5-1.5 1.1-2 1.8c-1.3-.1-2.7-.1-4 .1c-.5-.7-1.1-1.3-1.9-1.8c.6-1.8 1.1-3.7 1.3-5.6c1.8-1.6 3.5-3.4 5.1-5.3c1.2.4 2.5.6 3.8.7q.6 1.5 1.5 2.7c2.1.2 4.2.2 6.3.1c.7-.8 1.3-1.7 1.7-2.7q1.95 0 3.9-.6c1.5 1.8 3.1 3.6 4.9 5.2c.2 1.9.7 3.8 1.3 5.6c-.6.5-1.1 1.1-1.5 1.7c-1.4-.2-2.8-.1-4.3.1c-.6-.8-1.4-1.3-2.3-1.8c-.2-.8-.5-1.5-1-2.2"/>',
paw:'<path d="M21.8 8.5c2-.1 3.5 1.1 3.6 2.6c.3 1.7-.9 3.6-2.7 3.6c-1.7 0-3.2-1.1-3.5-2.9c0-1.6 1.4-3.1 3-3.2Zm11.3 6.2c1.6 0 3.4 1.4 3.3 3.1c-.2 1.8-1.8 3-3.3 3.1c-1.8-.2-3.3-1.7-2.9-3.4c0-1.8 1.5-3.2 3.5-2.8ZM36.7 27c1.5.1 2.6 1.4 2.8 3.2c-.3 1.6-1.5 2.7-2.9 3c-1.7.1-2.9-.7-3.4-2.4c-.2-1.4.8-3.1 2.2-3.6Zm-17.3-5.9c.9 0 1.9 0 2.8.3c1 .4 1.9 1 2.7 1.7q.9 1.2 1.5 2.4c.4 1 .6 2.1.7 3.2c.2 1.7.1 3.4-.1 5.1c0 .9-.1 1.7-.4 2.5c-.3.6-.8 1.1-1.3 1.5c-.5.6-1.1 1.1-1.8 1.4c-.8.2-1.5.3-2.3.2c-.6.1-1.3 0-1.8-.2c-.7-.5-1.3-1-1.8-1.7c-.6-.5-1.1-1.2-1.4-1.9c-.5-.8-.9-1.8-1.1-2.8c-1-.3-1.9-.8-2.7-1.4c-.8-.1-1.5-.4-2.2-.8c-.6-.5-1-1.1-1.4-1.8c-.3-.7-.4-1.4-.5-2.2c0-.6.1-1.3.4-1.9c.2-.8.6-1.5 1.1-2.1c.6-.5 1.2-.9 1.9-1.2c.7-.4 1.4-.6 2.2-.7c1.8-.1 3.7.1 5.5.4"/>',
letter:'<path d="M8 14c11-1.2 22-1.1 32 0c1 6.6.9 13.6 0 19.8c-11 1.1-22 1-31.9 0c-1-6.3-1-13.4-.1-19.8"/><path d="M9.5 15.5c1.8 1.8 3.6 3.4 5.4 4.9m18.2-.2c1.8-1.5 3.6-3.1 5.3-4.8M24 28.6c-4-2.7-5.1-5.1-3.7-6.6c1.7-1.8 3.5 0 3.7 1.1c.4-1.3 2.2-2.9 3.7-1.1c1.4 1.7 0 3.9-3.7 6.6"/>',
daisy:'<path d="M34.1 24.1c0 1 3.7 1.9 4.5 3c.9 1 1 2.4.7 3.2c-.5.9-1.5 1.9-2.8 2c-1.4.1-4.6-2.1-5.3-1.4s1.1 4 1 5.4s-1 2.7-1.8 3c-.8.4-2.2.2-3.4-.7c-1-1-2.1-4.8-3-4.8c-1.1 0-1.8 3.9-2.9 4.9c-1 .8-2.5.9-3.4.6c-.9-.4-1.8-1.5-2-2.9c-.2-1.3 1.8-4.6 1.2-5.3c-.6-.8-3.8 1.3-5.2 1.1c-1.3-.1-2.6-1.1-2.9-2c-.4-.9-.2-2.2.7-3.1c.9-1.1 4.8-2.1 4.8-3.1s-3.9-1.8-4.8-2.8c-.9-1.1-.9-2.7-.5-3.5c.4-1 1.5-1.9 2.8-2c1.4-.1 4.7 2 5.3 1.4c.6-.7-1.6-3.9-1.5-5.3c.3-1.4 1.4-2.8 2.3-3.2c.9-.3 2.4 0 3.3 1c1.1.9 1.8 4.6 2.8 4.6c.9 0 1.9-4 2.9-4.9c1.1-.9 2.7-.8 3.6-.4c.8.5 1.7 1.5 1.8 2.9s-2 4.6-1.4 5.3c.8.7 4.2-1.5 5.6-1.3c1.4.1 2.3 1.1 2.6 2.1c.4.8.3 2.2-.6 3.3c-.8.9-4.4 2-4.4 2.9"/><path d="M24.1 19.7c2.5 0 4.3 1.8 4.3 4.3c0 2.4-1.8 4.3-4.3 4.3s-4.3-1.8-4.3-4.3c0-2.4 1.7-4.2 4.3-4.3"/>',
cupcake:'<path d="M12.6 25.6c-.5-1-.7-2.1-.8-3.2c.7-1.1 1.5-2 2.5-2.8c1.1-.4 2.2-.6 3.4-.6c.5-1 1.1-2 1.8-2.8c.6-.5 1.4-.8 2.1-1.1c.8-.4 1.7-.7 2.6-.8c.7.2 1.3.5 1.8 1c.8 0 1.5.2 2.2.6c.8 1 1.4 2 2 3.2c1.2.1 2.4.3 3.6.8c.9.7 1.6 1.5 2.3 2.4c-.1 1.1-.3 2.2-.7 3.2c-7.6.8-15.2.9-22.8.1"/><path d="M14.5 25.8c.4 4.6.9 9.3 1.6 13.9c5.4.1 10.7 0 16.1-.2c.6-4.6 1.1-9.2 1.4-13.8M23 8.7c1.8-.7 3.5.3 4 2.2c.5 2-1.3 3.3-3 3.4c-2 0-3.3-1.4-2.9-3.3c.3-2.1 2.3-2.9 3.8-2.3Z"/><path d="M20.3 26q0 6.6.6 13.2m6.4-13.1c-.3 4.4-.4 8.8-.4 13.2"/>'
};
const I=(name,cls='ic')=>`<svg class="${cls}" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]||ICONS.info}</svg>`;
const esc=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const $=id=>document.getElementById(id);
const api=async(path,data)=>{if(globalThis.ParallelOffline)return globalThis.ParallelOffline.request(path,data);const o=await fetch('/api'+path,data?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}:{});let body;try{body=await o.json()}catch{throw Error('服务端没有返回 JSON')}if(!o.ok)throw Error(body.error||'请求失败');return body};
const state={tab:'discover',profiles:[],sources:[],settings:{},activeId:(()=>{try{return localStorage.getItem('parallel-active-profile')||''}catch{return ''}})(),candidates:[],deckIndex:0,threads:[],threadId:'',messages:[],chatMode:'chat',chatBusy:false,queue:{count:0,dueAt:0,status:'idle',blocked:false},flushBusy:false,terminalTab:'api',presetMode:'chat',presets:[],profileDraft:null,identResults:[],editPresetId:null,presetImportDraft:null,loading:false,draftInputs:{},renderedThreadId:'',bgTickCount:0};
const tabs=[{id:'profile',label:'我的',detail:'我的 Profile',icon:'user'},{id:'discover',label:'发现',detail:'发现心动',icon:'sparkleheart'},{id:'messages',label:'消息',detail:'你的消息',icon:'message'},{id:'terminal',label:'终端',detail:'终端设置',icon:'terminal'}];
let toastTimer;
function toast(text){const node=$('toast');node.textContent=text;node.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>node.classList.remove('show'),4000)}
function activeProfile(){return state.profiles.find(p=>p.id===state.activeId)||null}
function avatar(p,cls='mini-avatar'){return `<span class="${cls}" style="background:${p?.accent||'linear-gradient(135deg,#F9E0AE,#F7C5CC)'}">${p?.avatar||p?.portrait?`<img src="${esc(p.avatar||p.portrait)}" alt="">`:esc((p?.name||'?')[0].toUpperCase())}</span>`}
const fmtTime=s=>{try{return new Date(s).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}catch{return ''}};
const genderText={male:'男性',female:'女性',nonbinary:'非二元',other:'其他',all:'不限'};
async function bootstrap(){try{const data=await api('/bootstrap');state.profiles=data.profiles;state.sources=data.sources;state.settings=data.settings;if(!activeProfile())state.activeId=state.profiles[0]?.id||'';if(!activeProfile())state.tab='profile';renderChrome();await navigate(state.tab)}catch(e){$('view').innerHTML=`<div class="empty-state"><h2>无法连接本地服务</h2><p>${esc(e.message)}</p><p>${globalThis.ParallelOffline?'当前浏览器限制了数据存储，请使用 Chrome / Safari 普通窗口打开 HTML。':'请先运行 <code>python3 server.py</code>'}</p></div>`}}
function renderChrome(){const nav=x=>`<button type="button" class="${x.id===state.tab?'active ':''}nav-link" data-action="nav" data-tab="${x.id}">${I(x.icon)}<span>${x.detail}</span></button>`;$('side-nav').innerHTML=tabs.map(nav).join('');$('mobile-nav').innerHTML=tabs.map(x=>`<button type="button" class="${x.id===state.tab?'active':''}" data-action="nav" data-tab="${x.id}">${I(x.icon)}<span>${x.label}</span></button>`).join('');const p=activeProfile();$('sidebar-current').innerHTML=p?`${avatar(p)}<span><span class="subtle" style="font-size:9px">正在扮演</span><br>${esc(p.name)}</span>`:`<span class="mini-avatar empty-dog">${I('paw')}</span><span class="subtle">尚未创建角色</span>`;const mode=$('mode-pill');mode.textContent=globalThis.ParallelOffline&&!globalThis.ParallelOffline.storageAvailable?'临时会话 · 未持久化':state.settings.mode==='live'?'API 已配置':'演示模式';mode.classList.toggle('live',state.settings.mode==='live');$('section-title').textContent=tabs.find(x=>x.id===state.tab)?.detail||'Parallel';$('section-eyebrow').textContent=({profile:'YOUR IDENTITY',discover:'DISCOVER ANOTHER WORLD',messages:'CONNECTIONS THAT REMEMBER',terminal:'YOUR CREATIVE CONTROL'})[state.tab];const ctx=({profile:[['dog','不同 Profile 可以扮演完全不同的人。'],['shield','原作人物身份与其世界观背景将保持独立。']],discover:[['sparkleheart','每次刷新尝试展示 10 位已有作品角色。'],['clock','重复相遇，记忆不会重置。']],messages:[['letter','消息气泡与面对面小说使用不同预设。'],['book','解除匹配后再次相遇，旧消息仍然存在。']],terminal:[['lock','API Key 仅存放在本机服务的数据目录。'],['sliders','文字 Prompt 可以按模式分开编辑。']]})[state.tab];$('side-info').innerHTML=`<h3>一点关于这里的事</h3>${ctx.map(v=>`<div class="side-fact">${I(v[0])}<span>${v[1]}</span></div>`).join('')}`}
async function navigate(tab){
  const existingInput=$('chat-input');
  if(existingInput&&state.threadId)state.draftInputs[state.threadId]=existingInput.value;
  state.tab=tab;renderChrome();$('view').scrollTop=0;$('view').innerHTML='<div class="empty-state"><div class="empty-illustration">'+I('spark')+'</div><p>正在读取...</p></div>';try{if(tab==='profile')renderProfile();if(tab==='discover')await loadCandidates(false);if(tab==='messages')await loadThreads();if(tab==='terminal')await loadTerminal()}catch(e){toast(e.message);$('view').innerHTML=`<div class="empty-state"><h2>没有读取成功</h2><p>${esc(e.message)}</p><button class="btn soft" data-action="retry">重试</button></div>`}}
// Profile controls
function newDraft(){return {id:'',name:'',age:'',gender:'female',interested_in:['all'],min_age:18,max_age:60,intent:'认识新朋友',bio:'',interests:[],sources:[],avatar:'',role_character_id:'',role_hint:''}}
function renderProfile(draft){const p=activeProfile();const d=draft||state.profileDraft||p||newDraft();state.profileDraft=structuredClone(d);const creating=!d.id;
    $('topbar-actions').innerHTML=`<button class="btn soft" data-action="new-profile">${I('plus')} 新建身份</button>`;
    $('view').innerHTML=`<div class="profile-screen"><section class="profile-left"><div class="profile-card-preview"><div class="dots"></div><div class="profile-pic" id="profile-pic">${d.avatar?`<img src="${esc(d.avatar)}" alt="Profile 头像">`:I('dog')}</div><div class="profile-identity"><b>${esc(d.name||'你的名字')}${d.age?', '+d.age:''}</b><span>${esc(d.role_character_id?'已识别原作身份':'YOUR STORY, YOUR RULES')}</span></div></div><div class="profile-switches"><h4>切换扮演身份</h4>${state.profiles.map(x=>`<button class="profile-switch ${x.id===d.id?'active':''}" data-action="switch-profile" data-id="${esc(x.id)}">${avatar(x)}<span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(x.name)}</span></button>`).join('')||'<p class="caption">创建你的第一个 Profile</p>'}</div></section><form id="profile-form" class="profile-form"><div><div class="kicker">IDENTITY</div><h2 class="section-title">${creating?'创建新的身份':'编辑 '+esc(d.name)}</h2><p class="section-lead">可以扮演自己、原创设定，或原作人物。不同身份独立行动。</p></div><div class="field"><label>头像</label><input id="upload-avatar" type="file" accept="image/*" style="display:none"><div class="inline-row"><button class="btn soft" type="button" data-action="upload-avatar">${I('camera')} 上传照片</button>${d.avatar?`<button class="btn ghost" type="button" data-action="clear-avatar">移除</button>`:''}<span class="caption">照片只保存在本机；建议小于 1.5MB。</span></div></div><div class="fields-2"><div class="field"><label for="pf-name">姓名</label><input id="pf-name" name="name" maxlength="80" required placeholder="如 Leon / Stephanie" value="${esc(d.name)}"></div><div class="field"><label for="pf-age">年龄（18+）</label><input id="pf-age" name="age" type="number" min="18" max="120" placeholder="如 22" value="${esc(d.age??'')}"></div></div><div class="fields-2"><div class="field"><label for="pf-gender">性别</label><select id="pf-gender" name="gender">${Object.entries(genderText).filter(x=>x[0]!=='all').map(([v,t])=>`<option value="${v}" ${d.gender===v?'selected':''}>${t}</option>`).join('')}</select></div><div class="field"><label for="pf-intent">交友目的</label><select id="pf-intent" name="intent">${['认识新朋友','认真寻找恋人','短期约会','暂时不确定'].map(t=>`<option ${d.intent===t?'selected':''}>${t}</option>`).join('')}</select></div></div><div class="field"><label>个人简介（公开给匹配对象）</label><textarea id="pf-bio" name="bio" maxlength="500" placeholder="说点关于自己的事……">${esc(d.bio)}</textarea></div><div class="field"><label>兴趣爱好（逗号分隔）</label><input id="pf-interests" value="${esc((d.interests||[]).join('，'))}" placeholder="旅行，摄影，咖啡"></div><div class="form-divider">DATING PREFERENCES</div><div class="field"><label>希望遇见的性别</label><div id="gender-chips" class="chip-row">${[['all','不限'],['male','男性'],['female','女性'],['nonbinary','非二元']].map(([v,t])=>`<button type="button" class="chip ${(d.interested_in||[]).includes(v)?'active':''}" data-action="gender-chip" data-value="${v}">${t}</button>`).join('')}</div></div><div class="fields-2"><div class="field"><label>最低年龄</label><input id="pf-minage" type="number" min="18" max="120" value="${d.min_age}"></div><div class="field"><label>最高年龄</label><input id="pf-maxage" type="number" min="18" max="120" value="${d.min_age>d.max_age?d.min_age:d.max_age}"></div></div><div class="field"><label for="pf-source-input">希望匹配的作品（自行添加 Tag）</label><div class="source-composer"><input id="pf-source-input" type="text" maxlength="80" placeholder="输入作品名称，如 生化危机2 / 巫师3 / 漫威电影" autocomplete="off"><button type="button" class="btn soft" data-action="add-source-tag">${I('plus')} 添加</button></div><div id="source-chips" class="chip-row source-selected" aria-label="已添加的作品">${(d.sources||[]).map(s=>`<button type="button" class="chip active source-tag" data-action="remove-source-tag" data-value="${esc(s)}" title="移除 ${esc(s)}">${esc(s)} ${I('x')}</button>`).join('')}</div><span class="field-hint">输入作品名后按回车或点「添加」，支持中英文简称或代数（如 生化危机2、RE4、巫师3、漫威电影）。点 Tag 上的 × 删除。</span></div><div class="form-divider">CANON IDENTITY · 可选</div><div class="field"><label>我扮演的是原作人物吗？</label><div class="inline-row"><button type="button" class="btn soft" data-action="identify">${I('search')} 根据姓名识别原作人物</button><span class="caption" id="identity-label">${d.role_character_id?esc(d.role_character_id):'不选择即可使用普通自定义 Profile'}</span></div><div id="identify-results"></div><input type="hidden" id="pf-role-id" value="${esc(d.role_character_id||'')}"></div><div class="field"><label>补充身份说明（自动识别不到时选填）</label><input id="pf-hint" maxlength="300" placeholder="例如：来自某部作品的 Bryan、具体时期" value="${esc(d.role_hint||'')}"></div><div class="form-footer">${creating?'':`<button type="button" class="btn ghost" data-action="new-profile">另建身份</button>`}<button type="submit" class="btn primary">${I('check')} 保存身份</button></div></form></div>`;
    $('profile-form').addEventListener('submit',saveProfile);$('upload-avatar').addEventListener('change',uploadAvatar);
}
function readProfileDraft(){const old=state.profileDraft||newDraft();const chipSources=[...document.querySelectorAll('#source-chips .source-tag')].map(x=>x.dataset.value);const pendingInput=($('pf-source-input')?.value||'').split(/[，,]/).map(s=>s.trim().replace(/\s+/g,' ')).filter(Boolean);for(const item of pendingInput){if(!chipSources.some(s=>s.toLocaleLowerCase()===item.toLocaleLowerCase())&&chipSources.length<20)chipSources.push(item)}const rawAge=$('pf-age')?.value?.trim();return {...old,name:$('pf-name')?.value||'',age:rawAge?Number(rawAge):18,gender:$('pf-gender')?.value,intent:$('pf-intent')?.value,bio:$('pf-bio')?.value||'',interests:($('pf-interests')?.value||'').split(/[，,]/).map(s=>s.trim()).filter(Boolean),min_age:Number($('pf-minage')?.value)||18,max_age:Number($('pf-maxage')?.value)||60,interested_in:[...document.querySelectorAll('#gender-chips .active')].map(x=>x.dataset.value),sources:chipSources,role_character_id:$('pf-role-id')?.value||'',role_hint:$('pf-hint')?.value||''}}
async function saveProfile(e){e.preventDefault();try{const result=await api('/profile',readProfileDraft());state.profiles=state.profiles.filter(x=>x.id!==result.profile.id).concat(result.profile);state.activeId=result.profile.id;try{localStorage.setItem('parallel-active-profile',state.activeId)}catch{};state.profileDraft=null;toast('身份已保存');renderChrome();renderProfile(result.profile)}catch(e){toast(e.message)}}
function editChips(element){const wrap=element.closest('.chip-row');if(!wrap||wrap.id!=='gender-chips')return;const v=element.dataset.value;if(v==='all'){wrap.querySelectorAll('.chip').forEach(x=>x.classList.toggle('active',x.dataset.value==='all'));return}wrap.querySelector('[data-value="all"]')?.classList.remove('active');element.classList.toggle('active');if(!wrap.querySelector('.active'))wrap.querySelector('[data-value="all"]').classList.add('active')}
function addSourceTag(){const input=$('pf-source-input'),wrap=$('source-chips');if(!input||!wrap)return;const value=input.value.trim().replace(/\s+/g,' ');if(!value){input.focus();return}const existing=[...wrap.querySelectorAll('.source-tag')].map(x=>x.dataset.value);if(existing.some(s=>s.toLocaleLowerCase()===value.toLocaleLowerCase())){toast('这个作品已经添加了');input.select();return}if(existing.length>=20){toast('每个 Profile 最多添加 20 个作品 Tag');return}const tag=document.createElement('button');tag.type='button';tag.className='chip active source-tag';tag.dataset.action='remove-source-tag';tag.dataset.value=value;tag.title='移除 '+value;tag.innerHTML=esc(value)+' '+I('x');wrap.appendChild(tag);input.value='';input.focus()}
function removeSourceTag(btn){btn.remove();$('pf-source-input')?.focus()}
async function identifyAction(){const name=$('pf-name').value.trim();if(!name){toast('先填写姓名');return}try{const data=await api('/identify?name='+encodeURIComponent(name));const holder=$('identify-results');const selected=$('pf-role-id').value;holder.innerHTML=data.matches.length?`<div class="identify-box"><div class="caption">找到 ${data.matches.length} 个已收录的角色版本。请选择准确的平行世界身份：</div>${data.matches.map(c=>`<button type="button" class="ident-option ${selected===c.id?'active':''}" data-action="choose-identity" data-id="${esc(c.id)}">${I('usercheck')}<span><b>${esc(c.name)}</b> · ${esc(c.version)}<br><span class="subtle">${esc(c.source)}</span></span></button>`).join('')}<button type="button" class="btn ghost" data-action="clear-role">不使用原作身份</button></div>`:`<div class="notice">本地目录没有找到“${esc(name)}”。请在下方补充作品名称和时期；暂时不会假装已经确认原作设定。在线人物识别待接入外部可核实资料源。</div>`}catch(e){toast(e.message)}}
async function uploadAvatar(e){const file=e.target.files?.[0];if(!file)return;if(!file.type.startsWith('image/')){toast('请选择图片');return}const img=new Image(),url=URL.createObjectURL(file);img.onload=()=>{const cv=document.createElement('canvas');const scale=Math.min(1,520/Math.max(img.width,img.height));cv.width=Math.round(img.width*scale);cv.height=Math.round(img.height*scale);cv.getContext('2d').drawImage(img,0,0,cv.width,cv.height);state.profileDraft=readProfileDraft();state.profileDraft.avatar=cv.toDataURL('image/jpeg',.74);URL.revokeObjectURL(url);renderProfile(state.profileDraft);toast('头像已添加，保存 Profile 后生效')};img.onerror=()=>toast('头像读取失败');img.src=url}
// Discover and swipe
async function loadCandidates(showToast=false){$('topbar-actions').innerHTML=`${activeProfile()?`<button class="icon-btn" title="刷新 10 位候选" data-action="refresh">${I('refresh')}</button><button class="btn soft" data-action="go-profile">${I('user')} ${esc(activeProfile().name)}</button>`:''}`;if(!activeProfile()){return $('view').innerHTML=empty('dog','先创建你的 Profile','填写身份与作品来源后，就可以开始滑卡。','创建 Profile','profile')}
    if(!(activeProfile().sources||[]).length&&!state.allowAllSources){return $('view').innerHTML=`<div class="empty-state"><div class="empty-illustration">${I('compass')}</div><h2>还没有填写希望匹配的作品</h2><p>请先在你的 Profile 中添加「希望匹配的作品」Tag（如：生化危机、巫师3、漫威电影、赛博朋克2077），平行世界将只为你匹配对应作品中的角色。</p><div class="inline-row" style="justify-content:center"><button class="btn primary" data-action="nav" data-tab="profile">去添加作品 Tag ${I('arrow')}</button><button class="btn soft" data-action="allow-all-sources">不限作品 · 随机探索全部</button></div></div>`}
    const d=await api('/discover',{profileId:state.activeId});state.candidates=d.candidates;state.deckIndex=0;renderDiscover(d.total_available);if(showToast)toast(`已刷新：${d.candidates.length} 位候选${d.generation==='live-generated'?' · AI 已生成资料':''}${d.candidates.length<10?'（当前目录不足 10 位）':''}`);}
function empty(icon,title,description,button,target){return `<div class="empty-state"><div class="empty-illustration">${I(icon)}</div><h2>${esc(title)}</h2><p>${esc(description)}</p>${button?`<button class="btn primary" data-action="nav" data-tab="${target}">${esc(button)} ${I('arrow')}</button>`:''}</div>`}
function renderDiscover(total=state.candidates.length){const c=state.candidates[state.deckIndex];$('view').innerHTML=`<div class="discover-screen"><div class="discover-intro"><div><div class="kicker">YOUR NEXT CONNECTION</div><p>${esc(activeProfile()?.name||'')}，今天会遇见谁？</p></div><span class="counter">${c?`${state.deckIndex+1} / ${state.candidates.length}`:'0 / 0'} · ${total} 可选</span></div><div class="deck-container"><div class="deck-shadow"></div>${c?renderCard(c):`<div class="deck-empty">${I('sparkleheart')}<h3>${total===0?'暂时没有符合条件的角色':'这轮已经刷完啦'}</h3><p>${total===0?'你添加的作品 Tag 已经保存，但当前本地目录里没有符合这些条件的角色。可以先调整 Tag；后续再接入新作品识别。':'刷新再遇见新的候选，也可能再次刷到熟悉的人。'}</p>${total===0?`<button class="btn primary" data-action="nav" data-tab="profile">${I('user')} 编辑作品 Tag</button>`:`<button class="btn primary" data-action="refresh">${I('refresh')} 刷新候选</button>`}</div>`}</div>${c?`<div class="swipe-actions"><button class="pass" data-action="swipe-left" title="不感兴趣">${I('x')}</button><button class="details" data-action="card-details" title="查看背景">${I('info')}</button><button class="like" data-action="swipe-right" title="感兴趣">${I('heart')}</button></div>`:''}<div class="discover-bottom-note">左滑不感兴趣 · 右滑感兴趣<br>所有候选均来自已收录原作，不生成原创 AI 人物</div></div>`;if(c){attachSwipe();if(state.settings.image_mode==='live'&&!c.portrait&&state.portraitBusyId!==c.id&&!(state.portraitFailed&&state.portraitFailed[c.id]))generateCardPortrait(false,true)}}
function renderCard(c){
  const useImg=state.settings.image_mode==='live'||!!c.portrait;
  if(c.portrait){
    return `<div id="swipe-card" class="deck-card has-portrait-card" data-id="${esc(c.id)}" style="--card-color:${esc(c.accent)}"><div class="card-bg"></div><div class="card-portrait"><img src="${esc(c.portrait)}" alt="${esc(c.name)} 的照片"><button type="button" class="portrait-zoom-btn" data-action="photo-description" title="查看或重绘照片">${I('camera')} 照片详情</button></div><div class="swipe-stamp like" id="stamp-like">LIKE</div><div class="swipe-stamp nope" id="stamp-nope">NOPE</div><div class="card-top"><span class="series-badge">${esc(c.source)}</span></div><div class="card-info"><h2 class="card-name">${esc(c.name)} ${c.age?`<span class="age">${c.age}</span>`:''}</h2><div class="card-era">${esc(c.version)} ${c.previous_swipe?' · 曾经刷到过':''}</div><p class="card-bio">${esc(c.bio)}</p><div class="card-tags">${c.tags.map(x=>`<span>${esc(x)}</span>`).join('')}</div></div></div>`;
  }
  const busy=state.portraitBusyId===c.id;
  const label=useImg?(busy?'正在调用图片 AI 生成照片…':'点击生成 AI 角色照片'):'点击阅读照片描述';
  const iconName=useImg?'camera':'photo';
  const actionName=useImg?'generate-portrait':'photo-description';
  return `<div id="swipe-card" class="deck-card text-photo-card" data-id="${esc(c.id)}" style="--card-color:${esc(c.accent)}"><div class="card-bg"></div><button type="button" class="card-portrait photo-blank" data-action="${actionName}" aria-label="${esc(label)}" title="${esc(label)}" ${busy?'disabled':''}><span class="photo-blank-icon">${I(iconName)}</span><span class="photo-blank-caption">${esc(label)}</span></button><div class="swipe-stamp like" id="stamp-like">LIKE</div><div class="swipe-stamp nope" id="stamp-nope">NOPE</div><div class="card-top"><span class="series-badge">${esc(c.source)}</span></div><div class="card-info"><h2 class="card-name">${esc(c.name)} ${c.age?`<span class="age">${c.age}</span>`:''}</h2><div class="card-era">${esc(c.version)} ${c.previous_swipe?' · 曾经刷到过':''}</div><p class="card-bio">${esc(c.bio)}</p><div class="card-tags">${c.tags.map(x=>`<span>${esc(x)}</span>`).join('')}</div></div></div>`;
}
async function generateCardPortrait(regenerate=false,silent=false){
  const c=state.candidates[state.deckIndex];if(!c||state.portraitBusyId===c.id)return;
  state.portraitBusyId=c.id;state.portraitFailed=state.portraitFailed||{};
  if(state.tab==='discover')renderDiscover();
  try{
    const r=await api('/portrait',{characterId:c.id,regenerate});
    c.portrait=r.portrait;delete state.portraitFailed[c.id];
    if(regenerate)closeModal();
    if(!silent)toast('角色照片已生成');
  }catch(e){
    state.portraitFailed[c.id]=true;
    if(!silent)toast('图片生成失败（已回退为文字描写）：'+e.message);
    if(!silent)await photoDescriptionModal(false,true);
  }finally{
    state.portraitBusyId='';
    if(state.tab==='discover')renderDiscover();
  }
}
function attachSwipe(){const el=$('swipe-card');let startX=0,dx=0,dragging=false;el.addEventListener('pointerdown',e=>{if(e.target.closest('button'))return;dragging=true;startX=e.clientX;dx=0;el.classList.add('dragging');el.setPointerCapture(e.pointerId)});el.addEventListener('pointermove',e=>{if(!dragging)return;dx=e.clientX-startX;el.style.transform=`translateX(${dx}px) rotate(${dx/24}deg)`;$('stamp-like').style.opacity=Math.min(1,Math.max(0,dx/100));$('stamp-nope').style.opacity=Math.min(1,Math.max(0,-dx/100))});el.addEventListener('pointerup',e=>{if(!dragging)return;dragging=false;el.classList.remove('dragging');if(Math.abs(dx)>95){doSwipe(dx>0?'right':'left')}else{el.style.transform='';$('stamp-like').style.opacity=0;$('stamp-nope').style.opacity=0}})}
async function doSwipe(direction){if(state.loading)return;const c=state.candidates[state.deckIndex];if(!c)return;state.loading=true;const card=$('swipe-card');if(card){card.style.transform=`translateX(${direction==='right'?600:-600}px) rotate(${direction==='right'?25:-25}deg)`;card.style.opacity='0'}try{const res=await api('/swipe',{profileId:state.activeId,characterId:c.id,direction});state.deckIndex++;setTimeout(()=>renderDiscover(),130);if(res.matched&&!res.already_matched){setTimeout(()=>matchModal(c,res),330)}else if(res.already_matched){toast('你们已经在匹配列表中了')}else if(direction==='right'){toast(res.engine==='demo'?'对方这次没有选择匹配（演示判定）':'对方这次没有选择匹配')}}catch(e){toast(e.message);if(card){card.style.transform='';card.style.opacity='1'}}finally{state.loading=false}}
function matchModal(c,r){const html=`<div class="match-spotlight">${I('hearts')}<div class="match-text">IT'S A MATCH</div></div><h2>${r.again?'又遇见了，'+esc(c.name):'你们互相喜欢！'}</h2><p>${r.again?'你们之前的聊天和经历都还在。':'你可以现在开始聊天，角色也会给你发第一条消息。'}${r.engine==='demo'?' 当前匹配判定为演示模式。':''}</p>`;modal(html,`<button class="btn ghost" data-action="close-modal">继续发现</button><button class="btn primary" data-action="open-match" data-id="${esc(c.id)}">${I('letter')} 去聊天</button>`)}
function cardModal(){const c=state.candidates[state.deckIndex];if(!c)return;modal(`<div class="kicker">CANON PROFILE</div><h2>${esc(c.name)} · ${c.age||'年龄未公开'}</h2><p>${esc(c.source)} / ${esc(c.version)}</p><div class="glass-info"><b>已收录原作背景</b><p>${esc(c.canon)}</p></div><p>简介是约会软件中的公开资料，不等于这个角色拥有的全部秘密。</p>`,`<button class="btn soft" data-action="close-modal">返回卡片</button>`)}
async function photoDescriptionModal(regenerate=false,forceText=false){const c=state.candidates[state.deckIndex];if(!c)return;
  if(!forceText&&c.portrait){
    const content=`<div class="kicker">AI GENERATED PHOTO</div><h2>${esc(c.name)} 的照片</h2><p class="caption">${esc(c.source)} · ${esc(c.version)}</p><div class="portrait-modal-preview"><img src="${esc(c.portrait)}" alt="${esc(c.name)}"></div><p class="caption">由你配置的图片生成 API 生成并保存在本地。</p>`;
    const buttons=`<button class="btn ghost" data-action="close-modal">关闭</button><button class="btn soft" data-action="photo-text-fallback">${I('book')} 查看文字描写</button>${state.settings.image_mode==='live'?`<button class="btn primary" data-action="regenerate-portrait">${I('refresh')} 重新生成图片</button>`:''}`;
    return modal(content,buttons);
  }
  try{const r=await api('/photo-description',{characterId:c.id,regenerate});
    const content=`<div class="kicker">A PHOTO, IN WORDS</div><h2>${esc(c.name)} 的照片</h2><p class="caption">${esc(c.source)} · ${esc(c.version)}</p><div class="photo-description-paper"><p>${esc(r.description)}</p></div><p class="caption">${state.settings.image_mode==='live'?'你也可以点击下方按钮使用图片 API 生成实际图片。':`当前未填写图片生成 API，使用文字呈现照片。${r.engine==='live-text'?'这段描写由你配置的文字模型生成。':'这是固定的文字示意；连接文字模型后可生成更细致的描写，或在终端填写图片 API 生成图片。'}`}</p>`;
    const buttons=`<button class="btn ghost" data-action="close-modal">关闭</button>${state.settings.mode==='live'?`<button class="btn soft" data-action="photo-description-refresh">${I('refresh')} 重新描写（文字 API）</button>`:''}${state.settings.image_mode==='live'?`<button class="btn primary" data-action="regenerate-portrait">${I('camera')} 用图片 API 生成照片</button>`:''}`;
    modal(content,buttons);
  }catch(e){toast('照片文字描述失败：'+e.message)}
}
// Messages
async function loadThreads(preselect){$('topbar-actions').innerHTML=`<button class="btn soft" data-action="go-discover">${I('sparkleheart')} 继续发现</button>`;if(!activeProfile())return $('view').innerHTML=empty('dog','先创建 Profile','消息会按你当前扮演的身份分别展示。','创建 Profile','profile');const r=await api('/threads?profileId='+encodeURIComponent(state.activeId));state.threads=r.threads;if(preselect)state.threadId=preselect;if(!state.threads.find(x=>x.character.id===state.threadId))state.threadId=window.innerWidth>580?(state.threads[0]?.character.id||''):'';if(state.threadId)await loadThread(state.threadId,false);else renderMessages()}
async function loadThread(cid,render=true){
  const existingInput=$('chat-input');
  if(existingInput&&state.renderedThreadId)state.draftInputs[state.renderedThreadId]=existingInput.value;
  const r=await api('/thread?profileId='+encodeURIComponent(state.activeId)+'&characterId='+encodeURIComponent(cid));state.threadId=cid;state.messages=r.messages;state.chatMode=r.relation.mode;state.queue=r.queue||{count:0,dueAt:0,status:'idle',blocked:false};if(render)renderMessages();else renderMessages()}
function renderMessagesListItems(){
  return `<div class="threads-header">CONNECTIONS · ${state.threads.length}</div>${state.threads.map(x=>`<button class="thread-card ${x.character.id===state.threadId?'active':''}" data-action="select-thread" data-id="${esc(x.character.id)}">${avatar({...x.character,avatar:x.character.portrait})}<span class="thread-text"><b>${esc(x.character.name)}${x.queue?.count?`<span class="thread-queue-badge" title="${x.queue.count} 条待合批消息"></span>`:''}</b><p>${esc(x.last?.text||'刚刚匹配')}</p></span></button>`).join('')}`;
}
function renderChatMessagesHtml(c){
  let lastMode=null;
  const msg=state.messages.map(m=>{
    const mode=m.mode||state.chatMode;
    const transition=mode!==lastMode?`<div class="timeline-divider">${mode==='meeting'?`${I('map')} 开始面对面见面`:`${I('message')} 手机聊天`}</div>`:'';
    lastMode=mode;
    const canDel=m.id&&m.id!=='pending'&&m.id!=='typing';
    const delBtn=canDel?`<button type="button" class="msg-del-btn" data-action="delete-message" data-id="${esc(m.id)}" title="删除此条消息" aria-label="删除此条消息">删除</button>`:'';
    const time=`<span>${fmtTime(m.created_at)}${m.engine==='demo'?' · 演示回复':''}${m.engine==='error'?' · 接口错误':''}</span>${delBtn}`;
    if(mode==='meeting'){
      return `${transition}<div class="scene-entry ${m.sender==='user'?'scene-player':'scene-character'}"><div class="scene-speaker">${m.sender==='user'?'你的行动':esc(c.name)}</div><div class="scene-prose">${esc(m.text)}</div><div class="scene-time">${time}</div></div>`;
    }
    return `${transition}<div class="bubble-row ${m.sender==='user'?'mine':''}">${m.sender==='ai'?avatar({...c,avatar:c.portrait}):''}<div><div class="bubble">${esc(m.text)}</div><div class="chat-time">${time}</div></div></div>`;
  }).join('');
  const meeting=state.chatMode==='meeting';
  const nextDivider=lastMode&&lastMode!==state.chatMode?`<div class="timeline-divider next-mode">${I(meeting?'map':'message')} 接下来：${meeting?'面对面见面':'手机聊天'}</div>`:'';
  return msg+nextDivider;
}
function renderMessages(){
  const selected=state.threads.find(x=>x.character.id===state.threadId);
  const existingInput=$('chat-input');
  const wasFocused=existingInput&&document.activeElement===existingInput;
  const selStart=existingInput?existingInput.selectionStart:null;
  const selEnd=existingInput?existingInput.selectionEnd:null;
  if(existingInput&&state.renderedThreadId){
    state.draftInputs[state.renderedThreadId]=existingInput.value;
  }
  const isBusy=state.chatBusy||state.flushBusy||state.queue?.status==='inflight';
  // Surgical update when staying on the same thread so typing in #chat-input is never interrupted
  const layoutEl=document.querySelector('#view .messages-layout');
  const chatBodyEl=$('chat-body');
  if(selected&&layoutEl&&chatBodyEl&&existingInput&&state.renderedThreadId===state.threadId){
    const threadsEl=layoutEl.querySelector('.threads');
    if(threadsEl)threadsEl.innerHTML=renderMessagesListItems();
    const chatViewEl=layoutEl.querySelector('.chat-view');
    if(chatViewEl)chatViewEl.classList.toggle('meeting-mode',state.chatMode==='meeting');
    const meeting=state.chatMode==='meeting';
    const modeBtn=layoutEl.querySelector('[data-action="change-mode"]');
    if(modeBtn){
      modeBtn.className=`mode-switch ${meeting?'is-meeting':''}`;
      modeBtn.setAttribute('aria-label',meeting?'切换回手机聊天':'切换到面对面见面');
      modeBtn.innerHTML=`${I(meeting?'message':'map')}<span>${meeting?'返回聊天':'进入见面'}</span>`;
    }
    const noticeEl=layoutEl.querySelector('.current-mode-notice');
    if(noticeEl){
      noticeEl.className=`current-mode-notice ${meeting?'mode-meeting':''}`;
      noticeEl.innerHTML=`${I(meeting?'book':'message')}<span>${meeting?'下一条角色回复将使用面对面小说预设':'当前使用手机消息气泡预设'}</span>`;
    }
    chatBodyEl.innerHTML=renderChatMessagesHtml(selected.character);
    chatBodyEl.scrollTop=chatBodyEl.scrollHeight;
    existingInput.placeholder=meeting?'写下你在见面时的动作或台词……':'输入消息……';
    const sendBtn=layoutEl.querySelector('#chat-form .send');
    if(sendBtn)sendBtn.disabled=isBusy;
    const contBtn=layoutEl.querySelector('[data-action="continue-reply"]');
    if(contBtn){
      contBtn.disabled=isBusy;
      contBtn.innerHTML=`${I('spark')} 让角色继续回复${meeting?'（面对面）':''}`;
    }
    updateQueueCountdown();
    return;
  }
  state.renderedThreadId=selected?state.threadId:'';
  $('view').innerHTML=state.threads.length?`<div class="messages-layout ${selected?'has-chat':''}"><div class="threads">${renderMessagesListItems()}</div><div class="chat-view ${state.chatMode==='meeting'?'meeting-mode':''}">${selected?renderChat(selected):'<div class="empty-state"><div class="empty-illustration">'+I('letter')+'</div><h2>选一段对话</h2><p>每次相遇都有延续的故事。</p></div>'}</div></div>`:empty('letter','还没有匹配对象','去发现页滑动卡片；右滑喜欢后，对方也有自己的选择。','去发现','discover');
  const body=$('chat-body');if(body)body.scrollTop=body.scrollHeight;
  updateQueueCountdown();
  const input=$('chat-input');
  if(input){
    const draft=state.draftInputs[state.threadId]||'';
    if(draft)input.value=draft;
    input.addEventListener('input',e=>{if(state.threadId)state.draftInputs[state.threadId]=e.target.value});
    input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();$('chat-form').requestSubmit()}});
    $('chat-form').addEventListener('submit',sendMessage);
    if(wasFocused){
      input.focus();
      try{if(selStart!==null)input.setSelectionRange(selStart,selEnd)}catch{}
    }
  }
}
function renderChat(thread){
  const c=thread.character;
  const meeting=state.chatMode==='meeting';
  const isBusy=state.chatBusy||state.flushBusy||state.queue?.status==='inflight';
  const memButton=`<button type="button" class="mode-switch memory-btn" data-action="open-memories" title="查看与管理该角色的四层记忆与按需检索">${I('book')}<span>记忆档案</span></button>`;
  const modeButton=`<button type="button" class="mode-switch ${meeting?'is-meeting':''}" data-action="change-mode" aria-label="${meeting?'切换回手机聊天':'切换到面对面见面'}" title="${meeting?'后续回复使用手机消息预设':'后续回复使用面对面小说预设'}">${I(meeting?'message':'map')}<span>${meeting?'返回聊天':'进入见面'}</span></button>`;
  return `<div class="chat-header"><div class="chat-heading"><button class="icon-btn mobile-back" data-action="back-threads" title="返回">${I('back')}</button>${avatar({...c,avatar:c.portrait})}<span><b>${esc(c.name)}</b><small>${esc(c.version)}</small></span></div><div class="chat-header-actions">${memButton}${modeButton}<button class="icon-btn" data-action="unmatch" title="解除匹配">${I('more')}</button></div></div><div class="current-mode-notice ${meeting?'mode-meeting':''}">${I(meeting?'book':'message')}<span>${meeting?'下一条角色回复将使用面对面小说预设 · 仅按需检索该角色记忆':'当前使用手机消息气泡预设 · 仅按需检索该角色记忆'}</span></div><div id="chat-body" class="chat-body">${renderChatMessagesHtml(c)}</div><form id="chat-form" class="chat-compose"><textarea id="chat-input" rows="1" placeholder="${meeting?'写下你在见面时的动作或台词……':'输入消息……'}" maxlength="4000" required></textarea><button class="send" type="submit" title="发送并让角色回复" ${isBusy?'disabled':''}>${I('send')}</button></form><div class="chat-queue-status" id="chat-queue-status" aria-live="polite"></div><div class="chat-continue"><button type="button" class="continue-reply" data-action="continue-reply" ${isBusy?'disabled':''}>${I('spark')} 让角色继续回复${meeting?'（面对面）':''}</button></div>`;
}
const MEM_SOURCE_LABEL={
  confirmed_fact:'系统确认事实',
  milestone:'关系里程碑',
  dialogue:'亲历对话',
  'daily-summary':'日常归纳',
  direct_experience:'亲历互动',
  daily_summary:'日常归纳',
  spoken_claim:'对话陈述',
  correction:'已澄清纠正',
  inference:'推断印象'
};
async function openMemoriesModal(query=''){
  const thread=state.threads.find(x=>x.character.id===state.threadId);
  if(!thread||!state.activeId)return;
  const c=thread.character;
  try{
    const qs=`?profileId=${encodeURIComponent(state.activeId)}&characterId=${encodeURIComponent(c.id)}${query?`&query=${encodeURIComponent(query)}`:''}`;
    const data=await api('/memories'+qs);
    const recalled=data.recalledPreview||[];
    const list=data.memories||[];
    const html=`<div class="kicker">FOUR-LAYER MEMORY · 独立角色档案</div>
      <h2>${esc(c.name)} 的记忆档案</h2>
      <p class="caption">所有记忆严格绑定在角色 ID <code>${esc(c.id)}</code> 与当前 Profile 下，绝不与其他身份串联。每次调用 API 仅注入四层精简结构与 Top-4 检索结果，大幅节省 Token。</p>
      <div class="memory-layers-grid">
        <div class="memory-layer-box"><b>第一层 · 身份记忆</b><span>${esc(c.source)} · ${esc(c.version)}（固定设定，不可覆盖）</span></div>
        <div class="memory-layer-box"><b>第二层 · 关系基线</b><span>${esc(data.baseline||'暂无关系事件')}</span></div>
        <div class="memory-layer-box"><b>第四层 · 今日活跃窗口</b><span>仅携带今日最近 ${data.workingWindowCount} 条对话（历史共 ${data.totalMessagesCount} 条）</span></div>
      </div>
      <div class="memory-section">
        <div class="row-between"><label class="field-label">第三层 · 按需检索预览（最多召回 4 条，排除已在当前窗口内的消息）</label></div>
        <div class="source-composer" style="margin-top:6px">
          <input id="memory-search-input" type="text" placeholder="输入关键词或话题测试角色会召回哪些过往记忆…" value="${esc(query)}">
          <button type="button" class="btn soft" data-action="search-memories">${I('search')} 检索测试</button>
        </div>
        <div class="memory-recalled-list">
          ${recalled.length?recalled.map(m=>`<div class="memory-recalled-item">${esc(m.formatted)}</div>`).join(''):'<div class="caption" style="padding:6px 0">当前上下文无需额外召回过往情节（或相关内容已在今日活跃对话窗口内）。</div>'}
        </div>
      </div>
      <div class="memory-section">
        <label class="field-label">手动写入重要共同记忆 / 约定</label>
        <div class="source-composer" style="margin-top:6px">
          <input id="memory-add-input" type="text" maxlength="400" placeholder="例如：约定下周五晚一起去看海 / 对方记得我不喝冰美式">
          <button type="button" class="btn primary" data-action="add-memory">${I('plus')} 记录</button>
        </div>
      </div>
      <div class="memory-section">
        <div class="row-between"><label class="field-label">该角色 ID 下存储的全部情节记忆（${list.length} 条）</label><span class="caption">你也可以在聊天中直接说「你记错了，我们没有…」自动纠错</span></div>
        <div class="memory-archive-list">
          ${list.length?list.map(m=>`<div class="memory-item ${m.disputed?'is-disputed':''}">
            <div class="memory-item-top">
              <span class="memory-badge ${esc(m.source_type)}">${esc(MEM_SOURCE_LABEL[m.source_type]||m.source_type)}</span>
              ${m.unresolved?'<span class="memory-badge unresolved">未完待续</span>':''}
              ${m.disputed?'<span class="memory-badge disputed">存疑/已纠正</span>':''}
              <span class="memory-date">${esc((m.created_at||'').slice(0,16).replace('T',' '))}</span>
            </div>
            <div class="memory-summary">${esc(m.summary)}</div>
            <div class="memory-item-actions">
              ${!m.disputed?`<button type="button" class="btn ghost tiny-btn" data-action="prompt-correct-memory" data-id="${esc(m.id)}">澄清/纠正</button>`:''}
              <button type="button" class="btn ghost tiny-btn danger-text" data-action="delete-memory" data-id="${esc(m.id)}">删除</button>
            </div>
            <div class="memory-correct-box" id="mem-correct-${esc(m.id)}" style="display:none">
              <input type="text" id="mem-correct-input-${esc(m.id)}" placeholder="输入真实情况，原记忆将标记为存疑…">
              <button type="button" class="btn soft tiny-btn" data-action="submit-correct-memory" data-id="${esc(m.id)}">确认纠正</button>
            </div>
          </div>`).join(''):'<div class="caption" style="padding:12px 0">暂无沉淀的情节记忆。随着对话深入，重要互动与每日归纳会自动保存在此角色档案下。</div>'}
        </div>
      </div>`;
    modal(html,`<button class="btn soft" data-action="close-modal">关闭档案</button>`);
    const mEl=document.querySelector('#modal-root .modal');
    if(mEl)mEl.classList.add('modal-wide');
  }catch(e){toast('读取记忆档案失败：'+e.message)}
}
function updateQueueCountdown(){const el=$('chat-queue-status');if(!el)return;
  if(state.chatMode!=='chat'){el.textContent='';return}
  const q=state.queue||{},n=q.count||0;
  if(q.status==='inflight'){el.textContent='正在整合已发送的消息并等待回复…';return}
  if(!n){el.textContent='';return}
  if(q.blocked){el.textContent=`${n} 条短信已保存，模型请求失败。点击「让角色继续回复」重试。`;return}
  const left=Math.max(0,Math.ceil(((q.dueAt||0)-Date.now())/1000));
  el.textContent=`${n} 条短信已保存 · 安静 ${left} 秒后合并发送（新消息会重新计时）`;
}
async function flushChat(force=false){if(state.flushBusy||state.chatBusy||!state.threadId||state.chatMode!=='chat')return;
  state.flushBusy=true;const id=state.threadId,profileId=state.activeId;
  try{const r=await api('/chat-flush',{profileId,characterId:id,force});if(r.warning)toast('角色回复失败：'+r.warning);if(state.activeId===profileId&&state.threadId===id&&state.tab==='messages')await loadThreads(id)}
  catch(e){toast('合批发送失败：'+e.message)}finally{state.flushBusy=false}
}
async function flushBackgroundQueues(){
  if(state.flushBusy||state.chatBusy||!state.activeId)return;
  state.flushBusy=true;const profileId=state.activeId;
  try{
    const r=await api('/chat-flush-due',{profileId});
    const list=r?.flushed||[];
    for(const item of list){
      if(item.warning)toast(`${item.characterName} 回复失败：${item.warning}`);
      else if(item.reply)toast(`收到来自 ${item.characterName} 的新消息`);
    }
    if(list.length&&state.activeId===profileId&&state.tab==='messages'){
      await loadThreads(state.threadId);
    }
  }catch{}finally{state.flushBusy=false}
}
async function tickChatQueue(){
  if(!state.activeId)return;
  if(state.tab==='messages'&&state.threadId&&state.chatMode==='chat'){
    updateQueueCountdown();
    const q=state.queue;
    if(q?.count>0&&!q.blocked&&q.status!=='inflight'&&q.dueAt<=Date.now()&&!state.chatBusy&&!state.flushBusy){
      await flushChat(false);
      return;
    }
  }
  state.bgTickCount=(state.bgTickCount+1)%3;
  if(state.bgTickCount===0&&!state.chatBusy&&!state.flushBusy){
    await flushBackgroundQueues();
  }
}
setInterval(tickChatQueue,1000);
async function sendMessage(e){e.preventDefault();if(state.chatBusy)return;
  const input=$('chat-input'),txt=input?.value.trim();if(!txt)return;
  state.chatBusy=true;const id=state.threadId,mode=state.chatMode,profileId=state.activeId;
  input.value='';state.draftInputs[id]='';
  const now=new Date().toISOString();state.messages.push({id:'pending',sender:'user',mode,text:txt,created_at:now,engine:'human'});
  if(mode==='meeting')state.messages.push({id:'typing',sender:'ai',mode,text:'…',created_at:now,engine:'human'});
  renderMessages();
  try{const r=await api('/message',{profileId,characterId:id,text:txt});if(r.warning)toast(r.warning);if(state.activeId===profileId&&state.threadId===id)await loadThreads(id)}
  catch(e){toast(e.message);if(state.activeId===profileId&&state.threadId===id)await loadThreads(id)}
  finally{state.chatBusy=false;if(state.tab==='messages'&&state.threadId===id){renderMessages();const el=$('chat-input');if(el)el.focus()}}
}
async function continueReply(){if(state.chatBusy||state.flushBusy||state.queue?.status==='inflight'||!state.threadId)return;
  if(state.chatMode==='chat'&&state.queue?.count){return flushChat(true)}
  state.chatBusy=true;const id=state.threadId,profileId=state.activeId,mode=state.chatMode;state.messages.push({id:'typing',sender:'ai',mode,text:'…',created_at:new Date().toISOString(),engine:'human'});renderMessages();
  try{const r=await api('/reply',{profileId,characterId:id});if(r.warning)toast(r.warning);if(state.activeId===profileId&&state.threadId===id)await loadThreads(id)}catch(e){toast(e.message);if(state.activeId===profileId&&state.threadId===id)await loadThreads(id)}finally{state.chatBusy=false;if(state.tab==='messages'&&state.activeId===profileId&&state.threadId===id)renderMessages()}
}
async function deleteMessage(mid){
  if(!mid||!state.threadId||state.chatBusy)return;
  const id=state.threadId,profileId=state.activeId;
  try{
    await api('/message-delete',{profileId,characterId:id,messageId:mid});
    if(state.activeId===profileId&&state.threadId===id)await loadThreads(id);
    toast('消息已删除');
  }catch(e){toast(e.message)}
}
async function changeMode(){if(!state.threadId||state.chatBusy)return;const next=state.chatMode==='chat'?'meeting':'chat';
  try{await api('/mode',{profileId:state.activeId,characterId:state.threadId,mode:next});await loadThread(state.threadId);toast(next==='meeting'?'已切换到见面模式：未发送的短信回复已取消，聊天历史保留。现在可直接让角色用小说模式接话。':'已切回手机聊天：后续短信使用 60 秒安静合批。')}catch(e){toast(e.message)}
}
function confirmUnmatch(){const t=state.threads.find(x=>x.character.id===state.threadId);if(!t)return;modal(`<h2>要解除与 ${esc(t.character.name)} 的匹配吗？</h2><p>这会把对方从消息列表移除，但不会删除你们的聊天记录或角色的记忆。以后再次匹配时还会认得你。</p>`,`<button class="btn soft" data-action="close-modal">取消</button><button class="btn danger" data-action="confirm-unmatch">解除匹配</button>`)}
// Terminal
async function loadTerminal(){const [a,b]=await Promise.all([api('/settings'),api('/presets')]);state.settings=a;state.presets=b.entries;renderChrome();renderTerminal()}
function renderTerminal(){$('topbar-actions').innerHTML=`<span class="status-pill ${state.settings.mode==='live'?'live':''}">${state.settings.mode==='live'?'LIVE API':'DEMO MODE'}</span>`;$('view').innerHTML=`<div class="terminal-screen"><div class="terminal-tabs"><button class="terminal-tab ${state.terminalTab==='api'?'active':''}" data-action="term-tab" data-tab="api">${I('link')} 连接与模型</button><button class="terminal-tab ${state.terminalTab==='presets'?'active':''}" data-action="term-tab" data-tab="presets">${I('book')} 文字预设</button></div>${state.terminalTab==='api'?renderApiSettings():renderPresets()}${globalThis.ParallelOffline&&state.terminalTab==='api'?renderPortableBackup():''}</div>`;if(state.terminalTab==='api'){const form=$('api-settings-form');form.addEventListener('submit',saveSettings);$('api-temperature').addEventListener('input',e=>$('temp-output').textContent=e.target.value);$('api-top-p').addEventListener('input',e=>$('topp-output').textContent=e.target.value)} }
function renderPortableBackup(){return `<div class="terminal-card"><div class="kicker">LOCAL DATA</div><h3>存档备份</h3><p class="caption">单 HTML 版把聊天和 Profile 存在当前浏览器中。移动文件或清理浏览器数据可能导致存档丢失。建议定期导出备份。导出的 JSON 不包含 API Key。</p>${globalThis.ParallelOffline.storageAvailable?'':`<div class="notice" style="margin:12px 0">当前浏览器禁止本地持久化，刷新页面后存档可能消失。请在结束前导出备份。</div>`}<div class="inline-row" style="margin-top:14px"><button type="button" class="btn soft" data-action="export-backup">${I('book')} 导出存档 JSON</button><label class="btn soft file-upload">${I('refresh')} 恢复存档<input type="file" id="portable-restore" accept=".json,application/json"></label></div></div>`}
function exportBackup(){const raw=globalThis.ParallelOffline.exportData(),blob=new Blob([raw],{type:'application/json'}),href=URL.createObjectURL(blob),a=document.createElement('a');a.href=href;a.download='Parallel_Backup_'+new Date().toISOString().slice(0,10)+'.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(href),2000);toast('存档已导出（不包含 API Key）')}
let pendingRestoreText='';
async function importBackup(file){if(!file)return;try{pendingRestoreText=await file.text();modal(`<h2>恢复存档确认</h2><p>这将用备份文件 <b>${esc(file.name)}</b> 覆盖当前存档。确定继续吗？</p>`,`<button class="btn ghost" data-action="close-modal">取消</button><button class="btn primary" data-action="confirm-restore-backup">确认恢复</button>`)}catch(e){toast('读取备份失败：'+e.message)}}
async function confirmRestoreBackup(){if(!pendingRestoreText)return;try{const r=globalThis.ParallelOffline.importData(pendingRestoreText);pendingRestoreText='';closeModal();state.activeId='';state.profileDraft=null;state.threadId='';state.renderedThreadId='';state.draftInputs={};state.candidates=[];state.threads=[];state.messages=[];await bootstrap();toast(`已恢复 ${r.profiles} 个 Profile、${r.messages} 条消息，请重新填写 API Key`)}catch(e){toast('恢复失败：'+e.message)}}
function renderApiSettings(){const s=state.settings;return `<form id="api-settings-form"><div class="terminal-card"><div class="kicker">CONNECTION</div><h3>连接到你的模型</h3><p class="caption">${globalThis.ParallelOffline?'单文件 HTML 版直接从浏览器调用 OpenAI-compatible API（需要供应商允许 CORS）。':'使用 OpenAI-compatible 接口。通过本机服务调用模型。'}</p><div class="field"><label>API Base URL</label><input id="api-url" autocomplete="off" type="url" placeholder="https://your-provider.example/v1" value="${esc(s.base_url||'')}"></div><div class="field"><label>API Key</label><input id="api-key" type="password" autocomplete="new-password" placeholder="${s.has_key?'已保存密钥（留空不更改）':'sk-...'}"><span class="field-hint">${globalThis.ParallelOffline?'密钥在当前浏览器存储中以明文保存，避免在共享设备使用；如需更安全的 API 代理，请使用服务器版。':'密钥只在本机服务端 data/connection.json 中保存（权限 0600），不要分享 data 文件夹。'}</span></div><div class="inline-row" style="margin-top:14px"><button type="button" class="btn soft" data-action="clear-key">${I('trash')} 删除已存密钥</button>${s.has_key?'<span class="pill">密钥已保存</span>':''}</div><div class="divider"></div><div class="field"><label>聊天模型 ID</label><div class="inline-row" style="align-items:stretch"><input id="api-model" list="model-list" placeholder="点击拉取，或直接填写模型名" value="${esc(s.model||'')}" style="flex:1;min-width:130px"><datalist id="model-list"></datalist><button type="button" class="btn soft" data-action="fetch-models">${I('refresh')} 拉取</button></div></div></div><div class="terminal-card"><div class="kicker">SAMPLING</div><h3>生成参数</h3><p class="caption">按模型能力调整；不是每家供应商都支持所有参数。</p><div class="range-line"><span>Temperature</span><b id="temp-output">${s.temperature??.85}</b></div><input class="range" id="api-temperature" type="range" min="0" max="2" step="0.05" value="${s.temperature??.85}"><div class="range-line" style="margin-top:19px"><span>Top P</span><b id="topp-output">${s.top_p??1}</b></div><input class="range" id="api-top-p" type="range" min="0.05" max="1" step="0.05" value="${s.top_p??1}"><div class="field" style="margin-top:18px"><label>Max tokens</label><span class="field-hint">小狗乐园建议较长的小说回复；推荐 2400–3500，实际字数由模型决定。</span><input id="api-max-tokens" type="number" min="100" max="4096" value="${s.max_tokens||3000}"></div></div><div class="terminal-card"><div class="kicker">PHOTO &amp; IMAGE AI</div><h3>角色照片呈现与图片生成 AI</h3><p class="caption">如果填写了下方图片生成 AI 的 API 链接、密钥与模型，发现页将调用该接口生成角色照片；如果留空未填写，则保持文字描写显示。</p><div class="field"><label>图片生成 API Base URL（选填）</label><input id="api-image-url" autocomplete="off" type="url" placeholder="https://your-image-provider.example/v1（留空则用文字呈现照片）" value="${esc(s.image_base_url||'')}"></div><div class="field"><label>图片生成 API Key（选填）</label><input id="api-image-key" type="password" autocomplete="new-password" placeholder="${s.has_image_key?'已保存图片密钥（留空不更改）':'sk-...（留空则用文字呈现照片）'}"><span class="field-hint">支持兼容 OpenAI <code>/images/generations</code> 接口的生图服务。不填则自动使用文字描写。</span></div><div class="inline-row" style="margin-top:14px"><button type="button" class="btn soft" data-action="clear-image-key">${I('trash')} 删除图片密钥</button><span class="pill">${s.image_mode==='live'?'已启用图片生成 AI':(s.has_image_key?'图片密钥已保存':'当前：文字照片呈现')}</span></div><div class="divider"></div><div class="field"><label>图片生成模型 ID（选填）</label><div class="inline-row" style="align-items:stretch"><input id="api-image-model" list="image-model-list" placeholder="点击拉取，或直接填写生图模型名（如 dall-e-3 / gpt-image-1）" value="${esc(s.image_model||'')}" style="flex:1;min-width:130px"><datalist id="image-model-list"></datalist><button type="button" class="btn soft" data-action="fetch-image-models">${I('refresh')} 拉取</button></div></div></div><button type="submit" class="btn primary" style="width:100%;padding:15px">${I('check')} 保存终端配置</button><div class="notice" style="margin-top:14px">演示模式使用已收录的角色目录、确定性的示例匹配和明显标注的演示回复。只有连接模型后才会调用真实 LLM 或生图接口。首次调用可能产生费用。${globalThis.ParallelOffline?'模型供应商需允许网页跨域请求（CORS），否则请运行 Python 服务版。':'模型调用由本机服务端发起。'}</div></form>`}
async function saveSettings(e){e.preventDefault();try{const data={base_url:$('api-url').value.trim(),model:$('api-model').value.trim(),image_base_url:$('api-image-url').value.trim(),image_model:$('api-image-model').value.trim(),temperature:Number($('api-temperature').value),top_p:Number($('api-top-p').value),max_tokens:Number($('api-max-tokens').value)};if($('api-key').value)data.api_key=$('api-key').value;if($('api-image-key').value)data.image_api_key=$('api-image-key').value;const res=await api('/settings',data);state.settings=res.settings;state.portraitFailed={};renderChrome();renderTerminal();toast('终端配置已保存')}catch(e){toast(e.message)}}
async function fetchModels(){try{const s=$('api-url')?.value.trim(),m=$('api-model')?.value.trim(),k=$('api-key')?.value;if(s!==state.settings.base_url || k){toast('请先保存 API 地址和密钥，再拉取模型');return}const r=await api('/models');$('model-list').innerHTML=r.models.map(x=>`<option value="${esc(x)}"></option>`).join('');if(!m && r.models[0])$('api-model').value=r.models[0];toast(`找到 ${r.models.length} 个模型，已加入输入框候选`)}catch(e){toast(e.message)}}
async function fetchImageModels(){try{const s=$('api-image-url')?.value.trim(),m=$('api-image-model')?.value.trim(),k=$('api-image-key')?.value;if(s!==(state.settings.image_base_url||'') || k){toast('请先保存图片 API 地址和密钥，再拉取模型');return}const r=await api('/image-models');$('image-model-list').innerHTML=r.models.map(x=>`<option value="${esc(x)}"></option>`).join('');if(!m && r.models[0])$('api-image-model').value=r.models[0];toast(`找到 ${r.models.length} 个图片模型，已加入输入框候选`)}catch(e){toast(e.message)}}
function renderPresets(){const items=state.presets.filter(x=>x.mode===state.presetMode);return `<div class="terminal-card"><div class="kicker">TEXT PRESETS</div><h3>Prompt 条目管理</h3><p class="caption">聊天气泡和线下小说使用独立的条目与顺序。这里的编辑会直接影响每次真实模型请求。</p><div class="terminal-tabs"><button class="terminal-tab ${state.presetMode==='chat'?'active':''}" data-action="preset-mode" data-mode="chat">手机聊天</button><button class="terminal-tab ${state.presetMode==='meeting'?'active':''}" data-action="preset-mode" data-mode="meeting">面对面小说</button></div><div class="preset-toolbar"><span class="caption">${items.length} 个 Prompt 条目 · ${items.filter(x=>x.enabled).length} 个启用</span><button class="btn soft" data-action="add-preset">${I('plus')} 添加条目</button></div><div class="inline-row" style="margin:14px 0 8px"><button class="btn soft" data-action="export-preset" data-scope="current">${I('book')} 导出当前模式</button><button class="btn soft" data-action="export-preset" data-scope="all">${I('book')} 导出全部</button><label class="btn soft file-upload">${I('plus')} 导入 JSON<input id="preset-import-file" type="file" accept=".json,application/json"></label></div><p class="caption">支持 Parallel 自有 JSON 与 Elsewhere 自有预设 JSON（后者仅导入面对面小说）。导入前会确认追加或替换；不会影响 Profile、聊天和 API 设置。</p><div class="preset-list">${items.map((p,i)=>`<div class="preset-row"><div class="preset-order"><button class="icon-btn" data-action="move-preset" data-id="${esc(p.id)}" data-dir="-1" ${i===0?'disabled':''}>${I('up')}</button><button class="icon-btn" data-action="move-preset" data-id="${esc(p.id)}" data-dir="1" ${i===items.length-1?'disabled':''}>${I('down')}</button></div><div class="preset-text"><strong>${esc(p.name)}</strong><small>${esc(p.role)} · ${p.content.length} 字符</small></div><button class="icon-btn" title="编辑" data-action="edit-preset" data-id="${esc(p.id)}">${I('edit')}</button><button class="toggle ${p.enabled?'on':''}" title="启停" data-action="toggle-preset" data-id="${esc(p.id)}"></button></div>`).join('')}</div></div><div class="terminal-card"><h3>自定义文字预设</h3><p class="caption">这里仅使用 Parallel 自己的 Prompt 条目。你可以编辑条目、调整顺序，也可以单独导入或导出 Parallel 自有 JSON 预设。</p></div>`}
function makePresetPackage(scope){
  const modes=scope==='current'?[state.presetMode]:['chat','meeting'];
  const entries=state.presets.filter(p=>modes.includes(p.mode)).sort((a,b)=>modes.indexOf(a.mode)-modes.indexOf(b.mode)||a.sort_order-b.sort_order).map(p=>({mode:p.mode,name:p.name,role:p.role,enabled:!!p.enabled,content:p.content,sort_order:p.sort_order}));
  if(!entries.length)throw Error('当前模式没有可导出的 Prompt 条目');
  return {format:'parallel-text-preset',schemaVersion:1,name:'Parallel 自定义文字预设',exportedAt:new Date().toISOString(),modes,entries};
}
function downloadJson(value,name){
  const blob=new Blob([JSON.stringify(value,null,2)],{type:'application/json;charset=utf-8'}),href=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=href;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(href),2000);
}
function exportPreset(scope){const pack=makePresetPackage(scope);downloadJson(pack,'Parallel_Preset_'+(scope==='current'?state.presetMode:'all')+'_'+new Date().toISOString().slice(0,10)+'.json');toast('已导出 '+pack.entries.length+' 个预设条目，不包含账号、记忆或密钥')}
async function choosePresetImport(file){if(!file)return;
  try{if(file.size>4*1024*1024)throw Error('预设文件不能超过 4 MB');const pack=JSON.parse(await file.text());
    let desc='';if(pack?.format==='elsewhere-preset'&&pack.schemaVersion===1&&Array.isArray(pack.entries)&&pack.entries.length>0&&pack.entries.length<=200){
      desc=`Elsewhere 自有预设 · ${pack.entries.length} 个条目 → 仅面对面小说（保留原条目角色、启停及排序）`;
    }else if(pack?.format==='parallel-text-preset'&&pack.schemaVersion===1&&Array.isArray(pack.entries)&&Array.isArray(pack.modes)&&pack.entries.length>0&&pack.entries.length<=200){
      desc=pack.modes.map(m=>(m==='chat'?'手机聊天':'面对面小说')+' '+pack.entries.filter(x=>x.mode===m).length+' 条').join('、');
    }else throw Error('仅支持 Parallel 或 Elsewhere 自有预设 JSON');
    state.presetImportDraft=pack;
    modal(`<h2>导入文字预设</h2><p>文件：${esc(file.name)}</p><p>包含：${esc(desc)}</p><div class="notice">追加：保留已有条目；替换：仅替换文件涉及的模式，另一模式不受影响。不会修改原始 JSON 文件，也不会影响聊天或 API 设置。</div>`,`<button class="btn ghost" data-action="close-modal">取消</button><button class="btn soft" data-action="apply-preset-import" data-how="append">追加导入</button><button class="btn primary" data-action="apply-preset-import" data-how="replace">替换涉及模式</button>`);
  }catch(e){state.presetImportDraft=null;toast('导入文件无效：'+e.message)}
}
async function applyPresetImport(how){
  const pack=state.presetImportDraft;if(!pack)throw Error('请重新选择预设文件');
  const result=await api('/preset-import',{import_mode:how,preset:pack});state.presetImportDraft=null;closeModal();await refreshPresets();toast('成功导入 '+result.imported+' 个 Prompt 条目');
}
async function refreshPresets(){const d=await api('/presets');state.presets=d.entries;renderTerminal()}
function editPresetModal(p){const item=p||{id:'',name:'新 Prompt 条目',role:'system',enabled:true,content:'',mode:state.presetMode};const html=`<h2>${p?'编辑 Prompt':'新增 Prompt'}</h2><p>仅适用于「${item.mode==='chat'?'手机聊天':'面对面小说'}」模式。</p><form id="preset-edit-form"><div class="field"><label>条目名称</label><input id="pe-name" maxlength="100" value="${esc(item.name)}" required></div><div class="field"><label>Role</label><select id="pe-role">${['system','user','assistant'].map(r=>`<option ${item.role===r?'selected':''}>${r}</option>`).join('')}</select></div><div class="field"><label>Prompt 内容</label><textarea id="pe-content" rows="9" style="min-height:170px">${esc(item.content)}</textarea></div><label class="inline-row" style="font-size:12px;margin-top:12px"><input id="pe-enabled" type="checkbox" ${item.enabled?'checked':''}> 启用此条目</label></form>`;modal(html,`${p?'<button class="btn danger" data-action="delete-preset" data-id="'+esc(p.id)+'">删除</button>':''}<button class="btn ghost" data-action="close-modal">取消</button><button class="btn primary" data-action="save-preset" data-id="${esc(item.id)}">保存条目</button>`)}
async function savePreset(id){try{await api('/preset',{id:id||undefined,mode:state.presetMode,name:$('pe-name').value,role:$('pe-role').value,content:$('pe-content').value,enabled:$('pe-enabled').checked});closeModal();await refreshPresets();toast('Prompt 已保存')}catch(e){toast(e.message)}}
async function togglePreset(id){const p=state.presets.find(x=>x.id===id);if(!p)return;await api('/preset', {...p,enabled:!p.enabled});await refreshPresets()}
async function movePreset(id,dir){const list=state.presets.filter(x=>x.mode===state.presetMode),idx=list.findIndex(x=>x.id===id);if(idx<0||idx+dir<0||idx+dir>=list.length)return;[list[idx],list[idx+dir]]=[list[idx+dir],list[idx]];await api('/preset',{action:'order',ids:list.map(x=>x.id)});await refreshPresets()}
function modal(html,buttons){$('modal-root').innerHTML=`<div class="modal-overlay" id="modal-overlay"><div class="modal" role="dialog" aria-modal="true"><button class="icon-btn modal-close" data-action="close-modal">${I('x')}</button>${html}<div class="modal-actions">${buttons||`<button class="btn soft" data-action="close-modal">好的</button>`}</div></div></div>`}
function closeModal(){$('modal-root').innerHTML=''}
// Central action delegation
addEventListener('click',async e=>{const el=e.target.closest('[data-action]');if(!el)return;const a=el.dataset.action;try{
if(a==='nav')return await navigate(el.dataset.tab);
if(a==='retry')return await navigate(state.tab);
if(a==='go-profile')return navigate('profile');
if(a==='go-discover')return navigate('discover');
if(a==='new-profile'){state.profileDraft=newDraft();return renderProfile(state.profileDraft)}
if(a==='switch-profile'){state.activeId=el.dataset.id;try{localStorage.setItem('parallel-active-profile',state.activeId)}catch{};state.profileDraft=null;state.threadId='';state.renderedThreadId='';state.candidates=[];state.allowAllSources=false;renderChrome();return renderProfile(activeProfile())}
if(a==='allow-all-sources'){state.allowAllSources=true;return loadCandidates(true)}
if(a==='gender-chip')return editChips(el);
if(a==='add-source-tag')return addSourceTag();
if(a==='remove-source-tag')return removeSourceTag(el);
if(a==='identify')return identifyAction();
if(a==='choose-identity'){$('pf-role-id').value=el.dataset.id;$('identity-label').textContent=el.dataset.id;document.querySelectorAll('.ident-option').forEach(x=>x.classList.toggle('active',x===el));return}
if(a==='clear-role'){$('pf-role-id').value='';$('identity-label').textContent='使用普通 Profile';$('identify-results').innerHTML='';return}
if(a==='upload-avatar')return $('upload-avatar').click();
if(a==='clear-avatar'){state.profileDraft=readProfileDraft();state.profileDraft.avatar='';return renderProfile(state.profileDraft)}
if(a==='refresh')return loadCandidates(true);
if(a==='swipe-left')return doSwipe('left');
if(a==='swipe-right')return doSwipe('right');
if(a==='card-details')return cardModal();
if(a==='photo-description')return photoDescriptionModal();
if(a==='photo-text-fallback')return photoDescriptionModal(false,true);
if(a==='photo-description-refresh')return photoDescriptionModal(true,true);
if(a==='generate-portrait')return generateCardPortrait(false,false);
if(a==='regenerate-portrait')return generateCardPortrait(true,false);
if(a==='close-modal')return closeModal();
if(a==='open-match'){const id=el.dataset.id;closeModal();state.threadId=id;return navigate('messages')}
if(a==='select-thread')return loadThread(el.dataset.id);
if(a==='back-threads'){state.threadId='';state.renderedThreadId='';return renderMessages()}
if(a==='change-mode')return changeMode();
if(a==='open-memories')return openMemoriesModal('');
if(a==='search-memories')return openMemoriesModal($('memory-search-input')?.value.trim()||'');
if(a==='add-memory'){
  const val=$('memory-add-input')?.value.trim()||'';
  if(!val){toast('请先输入记忆内容');return}
  await api('/memory-action',{profileId:state.activeId,characterId:state.threadId,action:'add',summary:val});
  toast('已写入该角色的共同记忆档案');
  return openMemoriesModal($('memory-search-input')?.value.trim()||'');
}
if(a==='prompt-correct-memory'){
  const box=$('mem-correct-'+el.dataset.id);
  if(box){box.style.display=box.style.display==='none'?'flex':'none';$('mem-correct-input-'+el.dataset.id)?.focus()}
  return;
}
if(a==='submit-correct-memory'){
  const mid=el.dataset.id,val=$('mem-correct-input-'+mid)?.value.trim()||'';
  if(!val){toast('请输入澄清后的真实情况');return}
  await api('/memory-action',{profileId:state.activeId,characterId:state.threadId,action:'correct',memoryId:mid,correction:val});
  toast('已标记原记忆存疑并写入澄清记录');
  return openMemoriesModal($('memory-search-input')?.value.trim()||'');
}
if(a==='delete-memory'){
  await api('/memory-action',{profileId:state.activeId,characterId:state.threadId,action:'delete',memoryId:el.dataset.id});
  toast('记忆条目已删除');
  return openMemoriesModal($('memory-search-input')?.value.trim()||'');
}
if(a==='export-backup')return exportBackup();
if(a==='confirm-restore-backup')return confirmRestoreBackup();
if(a==='continue-reply')return continueReply();
if(a==='delete-message')return deleteMessage(el.dataset.id);
if(a==='unmatch')return confirmUnmatch();
if(a==='confirm-unmatch'){await api('/unmatch',{profileId:state.activeId,characterId:state.threadId});closeModal();state.threadId='';state.renderedThreadId='';await loadThreads();return toast('已解除匹配，记忆和聊天保留')}
if(a==='term-tab'){state.terminalTab=el.dataset.tab;return renderTerminal()}
if(a==='preset-mode'){state.presetMode=el.dataset.mode;return renderTerminal()}
if(a==='clear-key'){return modal('<h2>清除 API Key？</h2><p>确定清除当前保存的 API Key 吗？</p>','<button class="btn ghost" data-action="close-modal">取消</button><button class="btn danger" data-action="confirm-clear-key">确认清除</button>')}
if(a==='confirm-clear-key'){const r=await api('/settings',{clear_key:true});state.settings=r.settings;closeModal();renderTerminal();return toast('密钥已清除')}
if(a==='clear-image-key'){return modal('<h2>清除图片 API Key？</h2><p>确定清除当前保存的图片生成 API Key 吗？清除后将恢复为文字呈现照片。</p>','<button class="btn ghost" data-action="close-modal">取消</button><button class="btn danger" data-action="confirm-clear-image-key">确认清除</button>')}
if(a==='confirm-clear-image-key'){const r=await api('/settings',{clear_image_key:true});state.settings=r.settings;closeModal();renderTerminal();return toast('图片密钥已清除，已恢复文字照片模式')}
if(a==='fetch-models')return fetchModels();
if(a==='fetch-image-models')return fetchImageModels();
if(a==='export-preset')return exportPreset(el.dataset.scope);
if(a==='apply-preset-import')return applyPresetImport(el.dataset.how);
if(a==='add-preset')return editPresetModal(null);
if(a==='edit-preset')return editPresetModal(state.presets.find(x=>x.id===el.dataset.id));
if(a==='toggle-preset')return togglePreset(el.dataset.id);
if(a==='move-preset')return movePreset(el.dataset.id,Number(el.dataset.dir));
if(a==='save-preset')return savePreset(el.dataset.id);
if(a==='delete-preset'){await api('/preset',{action:'delete',id:el.dataset.id});closeModal();toast('条目已删除');return refreshPresets()}
}catch(err){toast(err.message)}});
addEventListener('change',e=>{if(e.target.id==='portable-restore')importBackup(e.target.files[0]);if(e.target.id==='preset-import-file')choosePresetImport(e.target.files[0])});
addEventListener('keydown',e=>{if(e.target.id==='pf-source-input'&&e.key==='Enter'){e.preventDefault();addSourceTag();return}if(e.target.id==='memory-search-input'&&e.key==='Enter'){e.preventDefault();openMemoriesModal(e.target.value.trim());return}if(e.target.id==='memory-add-input'&&e.key==='Enter'){e.preventDefault();document.querySelector('[data-action="add-memory"]')?.click();return}if(e.key==='Escape')closeModal();if(state.tab==='discover'&&e.target.tagName!=='INPUT'&&e.target.tagName!=='TEXTAREA'&&!$('modal-overlay')){if(e.key==='ArrowLeft')doSwipe('left');if(e.key==='ArrowRight')doSwipe('right')}});
bootstrap();
