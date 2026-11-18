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
cupcake:'<path d="M12.6 25.6c-.5-1-.7-2.1-.8-3.2c.7-1.1 1.5-2 2.5-2.8c1.1-.4 2.2-.6 3.4-.6c.5-1 1.1-2 1.8-2.8c.6-.5 1.4-.8 2.1-1.1c.8-.4 1.7-.7 2.6-.8c.7.2 1.3.5 1.8 1c.8 0 1.5.2 2.2.6c.8 1 1.4 2 2 3.2c1.2.1 2.4.3 3.6.8c.9.7 1.6 1.5 2.3 2.4c-.1 1.1-.3 2.2-.7 3.2c-7.6.8-15.2.9-22.8.1"/><path d="M14.5 25.8c.4 4.6.9 9.3 1.6 13.9c5.4.1 10.7 0 16.1-.2c.6-4.6 1.1-9.2 1.4-13.8M23 8.7c1.8-.7 3.5.3 4 2.2c.5 2-1.3 3.3-3 3.4c-2 0-3.3-1.4-2.9-3.3c.3-2.1 2.3-2.9 3.8-2.3Z"/><path d="M20.3 26q0 6.6.6 13.2m6.4-13.1c-.3 4.4-.4 8.8-.4 13.2"/>',
sent:'<path d="M12.5 25.5c2.6 2.8 5.2 5.6 7.6 8.6c5.3-6.7 10.9-13.2 16.8-19.5"/>',
read:'<path d="M7.5 25.5c2.4 2.6 4.8 5.3 7 8.1c5-6.4 10.3-12.6 15.8-18.6M19.5 26.2c2.1 2.3 4.2 4.6 6.2 7.1c4.8-6.2 9.9-12.2 15.2-18"/>',
unmatch:'<path d="M24 39c-7-5.5-13.5-10.8-15.5-17.5c-1.5-5 1-9.5 5.5-10.3c4-.7 7.7 1.6 10 5.4c2.3-3.9 6-6.2 10-5.4c4.5.9 7 5.4 5.4 10.4c-2.1 6.7-8.5 12-15.4 17.4"/><path d="M26.5 15.2l-4.2 7l4.8 3.6l-4.8 8"/>',
hotchat:'<path d="M26.5 8.5c-5.4 5.8-10.4 11.8-14.2 17.6c3.4.2 6.8.3 10.2.3c-1.2 4.4-2.5 8.8-4 13.1c6.2-6.1 11.8-12.6 16.2-19.2c-3.5-.2-7-.3-10.5-.3c.9-3.8 1.7-7.7 2.3-11.5"/>',
monitor:'<path d="M8.5 24c4.4-6.4 9.8-9.7 15.5-9.7s11.1 3.3 15.5 9.7c-4.4 6.4-9.8 9.7-15.5 9.7S12.9 30.4 8.5 24"/><path d="M24 19.2c2.8-.1 4.8 1.9 4.8 4.8s-2 4.8-4.8 4.8s-4.8-1.9-4.8-4.8s2-4.7 4.8-4.8"/>',
diary:'<path d="M12.5 9.5c7.8-.6 15.6-.6 23 .1c.7 9.6.7 19.3.1 28.9c-7.5.6-15.2.6-22.8.1c-.6-9.7-.6-19.4-.3-29.1"/><path d="M18.5 9.5c.1 4.2.1 8.4 0 12.6c1.8-1.4 3.5-2.8 5.2-4.2c1.7 1.4 3.4 2.8 5.1 4.2c.1-4.2.1-8.4 0-12.6m-10.3 19h11m-11 5.5h7.5"/>',
calendar:'<path d="M9.5 14.5c9.6-.8 19.3-.8 29 0c.7 7.8.7 15.7 0 23.5c-9.7.8-19.4.8-29 0c-.7-7.8-.7-15.7 0-23.5"/><path d="M16.5 9.5v6m15-6v6m-21.5 6.5h28m-21 6.5h.01m6.99 0h.01m6.99 0h.01m-14 6h.01m6.99 0h.01"/>',
mic:'<path d="M24 9.5c3.4 0 5.6 2.3 5.6 5.8v9.2c0 3.5-2.2 5.8-5.6 5.8s-5.6-2.3-5.6-5.8v-9.2c0-3.5 2.2-5.8 5.6-5.8"/><path d="M13 22.5c0 6.5 4.6 11.2 11 11.2s11-4.7 11-11.2M24 33.8v6.2m-6 0h12"/>',
sticker:'<path d="M24 8.5c8.8 0 15.5 6.7 15.5 15.5S32.8 39.5 24 39.5S8.5 32.8 8.5 24S15.2 8.5 24 8.5"/><path d="M18.2 20.5h.01M29.8 20.5h.01M17.5 28c2.2 3.2 5.6 4.5 9.6 3.6c1.4-.3 2.6-1.1 3.4-2.1"/>',
phone:'<path d="M14.5 10.5c2-.8 4.1-.4 5.4 1.4l2.3 3.6c.9 1.4.7 3.2-.5 4.4l-2.1 2.1c2 3.7 5.1 6.8 8.8 8.8l2.1-2.1c1.2-1.2 3-1.4 4.4-.5l3.6 2.3c1.8 1.3 2.2 3.4 1.4 5.4c-1.4 3.1-4.9 4.5-8.4 3.6C20.2 36.6 11.4 27.8 8.5 16.5c-.9-3.5.5-7 3.6-8.4Z"/>',
video:'<path d="M8.5 14.5c7.8-.6 15.7-.6 23.5 0c.6 6.3.6 12.7 0 19c-7.8.6-15.7.6-23.5 0c-.6-6.3-.6-12.7 0-19"/><path d="M32 20.5l8.5-4.8c.8-.4 1.5.1 1.5 1v14.6c0 .9-.7 1.4-1.5 1L32 27.5"/>'
};
const CHAT_PLUS_ITEMS=[
  {id:'photo',label:'照片',icon:'photo'},
  {id:'voice',label:'语音',icon:'mic'},
  {id:'sticker',label:'表情包',icon:'sticker'},
  {id:'call',label:'电话',icon:'phone'},
  {id:'videocall',label:'视频电话',icon:'video'}
];
const I=(name,cls='ic')=>`<svg class="${cls}" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]||ICONS.info}</svg>`;
const esc=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const $=id=>document.getElementById(id);
const localDateStr=ts=>{try{const d=new Date(ts||Date.now());return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}catch{return new Date().toISOString().slice(0,10)}};
const displayName=c=>String(c?.nickname||c?.display_name||c?.name||'').trim()||c?.name||'';
const cleanBodyText=(txt,sender='ai',preserveParagraphs=false)=>{
  const s=String(txt??'');
  if(sender==='user')return s;
  if(globalThis.ParallelOffline?.stripProtocolTags)return globalThis.ParallelOffline.stripProtocolTags(s,{preserveParagraphs});
  return s.replace(/^(?:[ \t]*(?:\[|【)\s*(?:短信|见面)(?:[\s:：·・\-]*(?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2}[\sT]*)?\d{1,2}\s*[:：]\s*\d{2}(?:\s*[:：]\s*\d{2})?)?\s*(?:\]|】)[ \t]*)+/gm,'');
};
const api=async(path,data)=>{if(globalThis.ParallelOffline)return globalThis.ParallelOffline.request(path,data);const o=await fetch('/api'+path,data?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}:{});let body;try{body=await o.json()}catch{throw Error('服务端没有返回 JSON')}if(!o.ok)throw Error(body.error||'请求失败');return body};
const state={tab:'discover',profiles:[],sources:[],settings:{},activeId:(()=>{try{return localStorage.getItem('parallel-active-profile')||''}catch{return ''}})(),candidates:[],deckIndex:0,threads:[],threadId:'',messages:[],meetings:[],surveillanceMap:{},diaryMap:{},diarySummaryMap:{},lastKnownDate:localDateStr(),activeMeetingId:'',meetingLocation:'',hotChat:false,chatPlusOpen:false,profileMenuOpen:false,memoryCategory:'all',lastMemoriesData:null,chatMode:'chat',chatBusy:false,queue:{count:0,pendingIds:[],dueAt:0,remainingMs:0,status:'idle',blocked:false,paceMode:'daily',hotChat:false,delayMinutes:0,targetTimeLabel:'',scheduleReason:''},flushBusy:false,revealingBubbles:false,hiddenReplyIds:new Set(),lastSendAt:0,lastUserActiveAt:Date.now(),proactiveBusy:false,idleTickCount:0,terminalTab:'api',presetMode:'chat',presets:[],presetDiagnostics:{},systemLogs:[],logFilterMode:'all',profileDraft:null,identResults:[],editPresetId:null,presetImportDraft:null,loading:false,draftInputs:{},renderedThreadId:'',bgTickCount:0,apiCheckPrompted:false};
const tabs=[{id:'profile',label:'我的',detail:'我的 Profile',icon:'user'},{id:'discover',label:'发现',detail:'发现心动',icon:'sparkleheart'},{id:'messages',label:'消息',detail:'你的消息',icon:'message'},{id:'terminal',label:'终端',detail:'终端设置',icon:'terminal'}];
let toastTimer;
function toast(text){const node=$('toast');node.textContent=text;node.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>node.classList.remove('show'),4000)}
function activeProfile(){return state.profiles.find(p=>p.id===state.activeId)||null}
function avatar(p,cls='mini-avatar'){return `<span class="${cls}" style="background:${p?.accent||'linear-gradient(135deg,#F9E0AE,#F7C5CC)'}">${p?.avatar||p?.portrait?`<img src="${esc(p.avatar||p.portrait)}" alt="">`:esc((p?.name||'?')[0].toUpperCase())}</span>`}
function renderProfileDropdownHtml(){
  const cur=activeProfile();
  if(!cur)return '';
  const isOpen=Boolean(state.profileMenuOpen);
  return `<div class="profile-dropdown-wrap ${isOpen?'is-open':''}" id="topbar-profile-dropdown">
    <button type="button" class="btn soft profile-dropdown-btn" data-action="toggle-profile-menu" aria-haspopup="listbox" aria-expanded="${isOpen?'true':'false'}" title="点击下拉切换账户">
      ${I('user')}
      <span class="profile-dropdown-name">${esc(cur.name)}</span>
      <span class="profile-dropdown-caret">${I('down')}</span>
    </button>
    <div class="profile-dropdown-menu ${isOpen?'open':''}" role="listbox" aria-label="切换账户">
      <div class="profile-dropdown-head">切换扮演身份 (${state.profiles.length})</div>
      <div class="profile-dropdown-list">
        ${state.profiles.map(p=>{
          const isCur=p.id===state.activeId;
          const tagLine=(p.sources||[]).slice(0,2).join(' · ')||'未设作品 Tag';
          return `<button type="button" role="option" aria-selected="${isCur?'true':'false'}" class="profile-dropdown-item ${isCur?'active':''}" data-action="quick-switch-profile" data-id="${esc(p.id)}">
            ${avatar(p,'mini-avatar')}
            <span class="profile-dropdown-info">
              <b>${esc(p.name)}${p.age?`, ${p.age}`:''}</b>
              <small>${esc(tagLine)}</small>
            </span>
            ${isCur?`<span class="profile-dropdown-check">${I('check')}</span>`:''}
          </button>`;
        }).join('')}
      </div>
    </div>
  </div>`;
}
const fmtTime=s=>{try{return new Date(s).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}catch{return ''}};
const genderText={male:'男性',female:'女性',nonbinary:'非二元',other:'其他',all:'不限'};
function getModeLabel(s){
  if(globalThis.ParallelOffline&&!globalThis.ParallelOffline.storageAvailable)return '临时会话 · 未持久化';
  if(s?.mode==='live')return 'API 已配置';
  if(s?.mode==='normal')return '正常模式 · 未连接 API';
  return '演示模式';
}
async function bootstrap(){
  try{
    const data=await api('/bootstrap');
    state.profiles=data.profiles;
    state.sources=data.sources;
    state.settings=data.settings;
    const hasApiConfig=Boolean(state.settings?.base_url&&state.settings?.model&&state.settings?.has_key);
    if(!hasApiConfig&&!state.apiCheckPrompted){
      state.apiCheckPrompted=true;
      const r=await api('/settings',{demo_enabled:false});
      state.settings=r.settings;
      setTimeout(()=>{
        modal(
          `<div class="kicker">API CHECK · 启动检测</div><h2>未监测到 API，是否进入演示模式？</h2><p>未检测到已填写的 API 链接、密钥与模型。是否进入演示模式体验？</p><p class="caption">选择<b>「是」</b>将进入演示模式；选择<b>「否」</b>将保持正常模式（仅未连接 API，随时可在「终端」填写）。</p>`,
          `<button type="button" class="btn soft" data-action="choose-api-mode" data-demo="no">否（保持正常模式）</button><button type="button" class="btn primary" data-action="choose-api-mode" data-demo="yes">是（进入演示模式）</button>`
        );
      },80);
    }
    if(!activeProfile())state.activeId=state.profiles[0]?.id||'';
    if(!activeProfile())state.tab='profile';
    renderChrome();
    if(state.activeId)await refreshInboxSnapshot().catch(()=>null);
    await navigate(state.tab);
    if(state.activeId&&state.settings.mode!=='normal'&&state.settings.proactive_mode!=='off'){
      setTimeout(()=>checkProactiveMessages('startup'),1100);
    }
  }catch(e){
    $('view').innerHTML=`<div class="empty-state"><h2>无法连接本地服务</h2><p>${esc(e.message)}</p><p>${globalThis.ParallelOffline?'当前浏览器限制了数据存储，请使用 Chrome / Safari 普通窗口打开 HTML。':'请先运行 <code>python3 server.py</code>'}</p></div>`;
  }
}
function renderChrome(){const nav=x=>`<button type="button" class="${x.id===state.tab?'active ':''}nav-link" data-action="nav" data-tab="${x.id}">${I(x.icon)}<span>${x.detail}</span></button>`;$('side-nav').innerHTML=tabs.map(nav).join('');$('mobile-nav').innerHTML=tabs.map(x=>`<button type="button" class="${x.id===state.tab?'active':''}" data-action="nav" data-tab="${x.id}">${I(x.icon)}<span>${x.label}</span></button>`).join('');const p=activeProfile();$('sidebar-current').innerHTML=p?`${avatar(p)}<span><span class="subtle" style="font-size:9px">正在扮演</span><br>${esc(p.name)}</span>`:`<span class="mini-avatar empty-dog">${I('paw')}</span><span class="subtle">尚未创建角色</span>`;const mode=$('mode-pill');mode.textContent=getModeLabel(state.settings);mode.classList.toggle('live',state.settings.mode==='live');$('section-title').textContent=tabs.find(x=>x.id===state.tab)?.detail||'Parallel';$('section-eyebrow').textContent=({profile:'YOUR IDENTITY',discover:'DISCOVER ANOTHER WORLD',messages:'CONNECTIONS THAT REMEMBER',terminal:'YOUR CREATIVE CONTROL'})[state.tab];const ctx=({profile:[['dog','不同 Profile 可以扮演完全不同的人。'],['shield','原作人物身份与其世界观背景将保持独立。']],discover:[['sparkleheart','每次刷新尝试展示 10 位已有作品角色。'],['clock','重复相遇，记忆不会重置。']],messages:[['letter','消息气泡与面对面小说使用不同预设。'],['book','解除匹配后再次相遇，旧消息仍然存在。']],terminal:[['lock','API Key 仅存放在本机服务的数据目录。'],['sliders','文字 Prompt 可以按模式分开编辑。']]})[state.tab];$('side-info').innerHTML=`<h3>一点关于这里的事</h3>${ctx.map(v=>`<div class="side-fact">${I(v[0])}<span>${v[1]}</span></div>`).join('')}`;updateNavUnread()}
async function navigate(tab){
  const existingInput=$('chat-input');
  if(existingInput&&state.threadId)state.draftInputs[state.threadId]=existingInput.value;
  state.profileMenuOpen=false;
  state.tab=tab;
  ++threadRequestSeq;
  const vEl=$('view');
  if(vEl)vEl.classList.toggle('is-discover-view',tab==='discover');
  renderChrome();$('view').scrollTop=0;$('view').innerHTML='<div class="empty-state"><div class="empty-illustration">'+I('spark')+'</div><p>正在读取...</p></div>';try{if(tab==='profile')renderProfile();if(tab==='discover')await loadCandidates(false);if(tab==='messages')await loadThreads();if(tab==='terminal')await loadTerminal()}catch(e){toast(e.message);$('view').innerHTML=`<div class="empty-state"><h2>没有读取成功</h2><p>${esc(e.message)}</p><button class="btn soft" data-action="retry">重试</button></div>`}}
// Profile controls
function newDraft(){return {id:'',name:'',age:'',gender:'female',interested_in:['all'],min_age:18,max_age:60,intent:'认识新朋友',bio:'',interests:[],sources:[],avatar:'',role_character_id:'',role_hint:''}}
function renderProfile(draft){const p=activeProfile();const d=draft||state.profileDraft||p||newDraft();state.profileDraft=structuredClone(d);const creating=!d.id;
    $('topbar-actions').innerHTML=`<button class="btn soft" data-action="new-profile">${I('plus')} 新建身份</button>`;
    $('view').innerHTML=`<div class="profile-screen"><section class="profile-left"><div class="profile-card-preview"><div class="dots"></div><div class="profile-pic" id="profile-pic">${d.avatar?`<img src="${esc(d.avatar)}" alt="Profile 头像">`:I('dog')}</div><div class="profile-identity"><b>${esc(d.name||'你的名字')}${d.age?', '+d.age:''}</b><span>${esc(d.role_character_id?'已识别原作身份':'YOUR STORY, YOUR RULES')}</span></div></div><div class="profile-switches"><h4>切换扮演身份</h4>${state.profiles.map(x=>`<button class="profile-switch ${x.id===d.id?'active':''}" data-action="switch-profile" data-id="${esc(x.id)}">${avatar(x)}<span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(x.name)}</span></button>`).join('')||'<p class="caption">创建你的第一个 Profile</p>'}</div></section><form id="profile-form" class="profile-form"><div><div class="kicker">IDENTITY</div><h2 class="section-title">${creating?'创建新的身份':'编辑 '+esc(d.name)}</h2><p class="section-lead">可以扮演自己、原创设定，或原作人物。不同身份独立行动。</p></div><div class="field"><label>头像</label><input id="upload-avatar" type="file" accept="image/*" style="display:none"><div class="inline-row"><button class="btn soft" type="button" data-action="upload-avatar">${I('camera')} 上传照片</button>${d.avatar?`<button class="btn ghost" type="button" data-action="clear-avatar">移除</button>`:''}<span class="caption">照片只保存在本机；建议小于 1.5MB。</span></div></div><div class="fields-2"><div class="field"><label for="pf-name">姓名</label><input id="pf-name" name="name" maxlength="80" required placeholder="如 Leon / Stephanie" value="${esc(d.name)}"></div><div class="field"><label for="pf-age">年龄（18+）</label><input id="pf-age" name="age" type="number" min="18" max="120" placeholder="如 22" value="${esc(d.age??'')}"></div></div><div class="fields-2"><div class="field"><label for="pf-gender">性别</label><select id="pf-gender" name="gender">${Object.entries(genderText).filter(x=>x[0]!=='all').map(([v,t])=>`<option value="${v}" ${d.gender===v?'selected':''}>${t}</option>`).join('')}</select></div><div class="field"><label for="pf-intent">交友目的</label><select id="pf-intent" name="intent">${['认识新朋友','认真寻找恋人','短期约会','暂时不确定'].map(t=>`<option ${d.intent===t?'selected':''}>${t}</option>`).join('')}</select></div></div><div class="field"><label>个人简介（公开给匹配对象）</label><textarea id="pf-bio" name="bio" maxlength="500" placeholder="说点关于自己的事……">${esc(d.bio)}</textarea></div><div class="field"><label>兴趣爱好（逗号分隔）</label><input id="pf-interests" value="${esc((d.interests||[]).join('，'))}" placeholder="旅行，摄影，咖啡"></div><div class="form-divider">DATING PREFERENCES</div><div class="field"><label>希望遇见的性别</label><div id="gender-chips" class="chip-row">${[['all','不限'],['male','男性'],['female','女性'],['nonbinary','非二元']].map(([v,t])=>`<button type="button" class="chip ${(d.interested_in||[]).includes(v)?'active':''}" data-action="gender-chip" data-value="${v}">${t}</button>`).join('')}</div></div><div class="fields-2"><div class="field"><label>最低年龄</label><input id="pf-minage" type="number" min="18" max="120" value="${d.min_age}"></div><div class="field"><label>最高年龄</label><input id="pf-maxage" type="number" min="18" max="120" value="${d.min_age>d.max_age?d.min_age:d.max_age}"></div></div><div class="field"><label for="pf-source-input">希望匹配的作品（自行添加 Tag）</label><div class="source-composer"><input id="pf-source-input" type="text" maxlength="80" placeholder="输入作品名称，如 生化危机2 / 巫师3 / 漫威电影" autocomplete="off"><button type="button" class="btn soft" data-action="add-source-tag">${I('plus')} 添加</button></div><div id="source-chips" class="chip-row source-selected" aria-label="已添加的作品">${(d.sources||[]).map(s=>`<button type="button" class="chip active source-tag" data-action="remove-source-tag" data-value="${esc(s)}" title="移除 ${esc(s)}">${esc(s)} ${I('x')}</button>`).join('')}</div><span class="field-hint">输入作品名后按回车或点「添加」，支持中英文简称或代数（如 生化危机2、RE4、巫师3、漫威电影）。点 Tag 上的 × 删除。</span></div><div class="form-divider">CANON IDENTITY · 可选</div><div class="field"><label>我扮演的是原作人物吗？</label><div class="inline-row"><button type="button" class="btn soft" data-action="identify">${I('search')} 根据姓名识别原作人物</button><span class="caption" id="identity-label">${d.role_character_id?esc(d.role_character_id):'不选择即可使用普通自定义 Profile'}</span></div><div id="identify-results"></div><input type="hidden" id="pf-role-id" value="${esc(d.role_character_id||'')}"></div><div class="field"><label>补充身份说明（自动识别不到时选填）</label><input id="pf-hint" maxlength="300" placeholder="例如：来自某部作品的 Bryan、具体时期" value="${esc(d.role_hint||'')}"></div><div class="form-footer">${creating?'':`<button type="button" class="btn ghost" data-action="new-profile">另建身份</button>`}<button type="submit" class="btn primary">${I('check')} 保存身份</button></div></form></div>`;
    $('profile-form').addEventListener('submit',saveProfile);$('upload-avatar').addEventListener('change',uploadAvatar);
}
function readProfileDraft(){const old=state.profileDraft||newDraft();const chipSources=[...document.querySelectorAll('#source-chips .source-tag')].map(x=>x.dataset.value);const pendingInput=($('pf-source-input')?.value||'').split(/[，,]/).map(s=>s.trim().replace(/\s+/g,' ')).filter(Boolean);for(const item of pendingInput){if(!chipSources.some(s=>s.toLocaleLowerCase()===item.toLocaleLowerCase())&&chipSources.length<20)chipSources.push(item)}const rawAge=$('pf-age')?.value?.trim();return {...old,name:$('pf-name')?.value||'',age:rawAge?Number(rawAge):18,gender:$('pf-gender')?.value,intent:$('pf-intent')?.value,bio:$('pf-bio')?.value||'',interests:($('pf-interests')?.value||'').split(/[，,]/).map(s=>s.trim()).filter(Boolean),min_age:Number($('pf-minage')?.value)||18,max_age:Number($('pf-maxage')?.value)||60,interested_in:[...document.querySelectorAll('#gender-chips .active')].map(x=>x.dataset.value),sources:chipSources,role_character_id:$('pf-role-id')?.value||'',role_hint:$('pf-hint')?.value||''}}
async function saveProfile(e){e.preventDefault();try{const result=await api('/profile',readProfileDraft());state.profiles=state.profiles.filter(x=>x.id!==result.profile.id).concat(result.profile);state.activeId=result.profile.id;try{localStorage.setItem('parallel-active-profile',state.activeId)}catch{};state.profileDraft=null;toast('身份已保存');renderChrome();refreshInboxQuietly();renderProfile(result.profile)}catch(e){toast(e.message)}}
function editChips(element){const wrap=element.closest('.chip-row');if(!wrap||wrap.id!=='gender-chips')return;const v=element.dataset.value;if(v==='all'){wrap.querySelectorAll('.chip').forEach(x=>x.classList.toggle('active',x.dataset.value==='all'));return}wrap.querySelector('[data-value="all"]')?.classList.remove('active');element.classList.toggle('active');if(!wrap.querySelector('.active'))wrap.querySelector('[data-value="all"]').classList.add('active')}
function addSourceTag(){const input=$('pf-source-input'),wrap=$('source-chips');if(!input||!wrap)return;const value=input.value.trim().replace(/\s+/g,' ');if(!value){input.focus();return}const existing=[...wrap.querySelectorAll('.source-tag')].map(x=>x.dataset.value);if(existing.some(s=>s.toLocaleLowerCase()===value.toLocaleLowerCase())){toast('这个作品已经添加了');input.select();return}if(existing.length>=20){toast('每个 Profile 最多添加 20 个作品 Tag');return}const tag=document.createElement('button');tag.type='button';tag.className='chip active source-tag';tag.dataset.action='remove-source-tag';tag.dataset.value=value;tag.title='移除 '+value;tag.innerHTML=esc(value)+' '+I('x');wrap.appendChild(tag);input.value='';input.focus()}
function removeSourceTag(btn){btn.remove();$('pf-source-input')?.focus()}
async function identifyAction(){const name=$('pf-name').value.trim();if(!name){toast('先填写姓名');return}try{const data=await api('/identify?name='+encodeURIComponent(name));const holder=$('identify-results');const selected=$('pf-role-id').value;holder.innerHTML=data.matches.length?`<div class="identify-box"><div class="caption">找到 ${data.matches.length} 个已收录的角色版本。请选择准确的平行世界身份：</div>${data.matches.map(c=>`<button type="button" class="ident-option ${selected===c.id?'active':''}" data-action="choose-identity" data-id="${esc(c.id)}">${I('usercheck')}<span><b>${esc(c.name)}</b> · ${esc(c.version)}<br><span class="subtle">${esc(c.source)}</span></span></button>`).join('')}<button type="button" class="btn ghost" data-action="clear-role">不使用原作身份</button></div>`:`<div class="notice">本地目录没有找到“${esc(name)}”。请在下方补充作品名称和时期；暂时不会假装已经确认原作设定。在线人物识别待接入外部可核实资料源。</div>`}catch(e){toast(e.message)}}
async function uploadAvatar(e){const file=e.target.files?.[0];if(!file)return;if(!file.type.startsWith('image/')){toast('请选择图片');return}const img=new Image(),url=URL.createObjectURL(file);img.onload=()=>{const cv=document.createElement('canvas');const scale=Math.min(1,520/Math.max(img.width,img.height));cv.width=Math.round(img.width*scale);cv.height=Math.round(img.height*scale);cv.getContext('2d').drawImage(img,0,0,cv.width,cv.height);state.profileDraft=readProfileDraft();state.profileDraft.avatar=cv.toDataURL('image/jpeg',.74);URL.revokeObjectURL(url);renderProfile(state.profileDraft);toast('头像已添加，保存 Profile 后生效')};img.onerror=()=>toast('头像读取失败');img.src=url}
// Discover and swipe
async function loadCandidates(showToast=false){$('topbar-actions').innerHTML=`${activeProfile()?`<button class="icon-btn" title="刷新 10 位候选" data-action="refresh">${I('refresh')}</button>${renderProfileDropdownHtml()}`:''}`;if(!activeProfile()){return $('view').innerHTML=empty('dog','先创建你的 Profile','填写身份与作品来源后，就可以开始滑卡。','创建 Profile','profile')}
    if(!(activeProfile().sources||[]).length&&!state.allowAllSources){return $('view').innerHTML=`<div class="empty-state"><div class="empty-illustration">${I('compass')}</div><h2>还没有填写希望匹配的作品</h2><p>请先在你的 Profile 中添加「希望匹配的作品」Tag（如：生化危机、巫师3、漫威电影、赛博朋克2077），平行世界将只为你匹配对应作品中的角色。</p><div class="inline-row" style="justify-content:center"><button class="btn primary" data-action="nav" data-tab="profile">去添加作品 Tag ${I('arrow')}</button><button class="btn soft" data-action="allow-all-sources">不限作品 · 随机探索全部</button></div></div>`}
    const d=await api('/discover',{profileId:state.activeId,refresh:Boolean(showToast)});state.candidates=d.candidates;state.deckIndex=0;renderDiscover(d.total_available);if(showToast)toast(`已刷新：${d.candidates.length} 位候选${d.generation==='live-generated'?' · AI 已重新生成角色档案':''}${d.candidates.length<10?'（当前目录不足 10 位）':''}`);}
function empty(icon,title,description,button,target){return `<div class="empty-state"><div class="empty-illustration">${I(icon)}</div><h2>${esc(title)}</h2><p>${esc(description)}</p>${button?`<button class="btn primary" data-action="nav" data-tab="${target}">${esc(button)} ${I('arrow')}</button>`:''}</div>`}
function renderDiscover(total=state.candidates.length){const c=state.candidates[state.deckIndex];$('view').classList.add('is-discover-view');$('view').innerHTML=`<div class="discover-screen"><div class="discover-intro"><p class="discover-greeting">${esc(activeProfile()?.name||'')}，今天会遇见谁？</p><span class="counter">${c?`${state.deckIndex+1} / ${state.candidates.length}`:'0 / 0'} · ${total} 可选</span></div><div class="deck-container"><div class="deck-shadow"></div>${c?renderCard(c):`<div class="deck-empty">${I('sparkleheart')}<h3>${total===0?'暂时没有符合条件的角色':'这轮已经刷完啦'}</h3><p>${total===0?'你添加的作品 Tag 已经保存，但当前本地目录里没有符合这些条件的角色。可以先调整 Tag；后续再接入新作品识别。':'刷新再遇见新的候选，也可能再次刷到熟悉的人。'}</p>${total===0?`<button class="btn primary" data-action="nav" data-tab="profile">${I('user')} 编辑作品 Tag</button>`:`<button class="btn primary" data-action="refresh">${I('refresh')} 刷新候选</button>`}</div>`}</div>${c?`<div class="swipe-actions"><button class="pass" data-action="swipe-left" title="不感兴趣">${I('x')}</button><button class="details" data-action="card-details" title="查看背景">${I('info')}</button><button class="like" data-action="swipe-right" title="感兴趣">${I('heart')}</button></div>`:''}</div>`;if(c){attachSwipe();if(state.settings.image_mode==='live'&&!c.portrait&&state.portraitBusyId!==c.id&&!(state.portraitFailed&&state.portraitFailed[c.id]))generateCardPortrait(false,true)}}
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
async function doSwipe(direction){if(state.loading)return;const c=state.candidates[state.deckIndex];if(!c)return;state.loading=true;const card=$('swipe-card');if(card){card.style.transform=`translateX(${direction==='right'?600:-600}px) rotate(${direction==='right'?25:-25}deg)`;card.style.opacity='0'}try{const res=await api('/swipe',{profileId:state.activeId,characterId:c.id,direction});state.deckIndex++;setTimeout(()=>renderDiscover(),130);if(res.matched&&!res.already_matched){refreshInboxQuietly();setTimeout(()=>matchModal(c,res),330)}else if(res.already_matched){toast('你们已经在匹配列表中了')}else if(direction==='right'){toast(res.engine==='demo'?'对方这次没有选择匹配（演示判定）':'对方这次没有选择匹配')}}catch(e){toast(e.message);if(card){card.style.transform='';card.style.opacity='1'}}finally{state.loading=false}}
function matchModal(c,r){const isNormal=state.settings.mode==='normal';const html=`<div class="match-spotlight">${I('hearts')}<div class="match-text">IT'S A MATCH</div></div><h2>${r.again?'又遇见了，'+esc(c.name):'你们互相喜欢！'}</h2><p>${r.again?'你们之前的聊天和经历都还在。':(isNormal?'你们已经建立匹配，连接 API 后角色会用真实模型向你打招呼，你也可以现在先发消息。':'你可以现在开始聊天，角色也给你发来了第一条消息。')}${r.engine==='demo'?' 当前匹配判定为演示模式。':''}</p>`;modal(html,`<button class="btn ghost" data-action="close-modal">继续发现</button><button class="btn primary" data-action="open-match" data-id="${esc(c.id)}">${I('letter')} 去聊天</button>`)}
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

// Read cursors are per device, Profile and character; never count outgoing queue entries.
const READ_CURSOR_KEY='parallel-incoming-read-v1';
let readCursors=(()=>{try{const x=JSON.parse(localStorage.getItem(READ_CURSOR_KEY)||'{}');return x&&typeof x==='object'&&!Array.isArray(x)?x:{};}catch{return {};}})();
let inboxSnapshot={profileId:'',threads:[]};
let inboxRequestSeq=0,threadRequestSeq=0;
const isIncoming=m=>Boolean(m&&m.id&&m.sender==='ai'&&m.engine!=='error'&&m.engine!=='recalled'&&!m.recalled&&!(m.mode!=='meeting'&&/^[\s|｜]*[|｜]{2,}[\s|｜]*$/.test(String(m.text||''))));
const saveReadCursors=()=>{try{localStorage.setItem(READ_CURSOR_KEY,JSON.stringify(readCursors));}catch{}};
function applyInboxSnapshot(pid,threads){
  if(pid!==state.activeId)return false;
  if(!Object.prototype.hasOwnProperty.call(readCursors,pid)){
    // Old versions had no read cursor; existing conversations are read once on migration.
    readCursors[pid]={};
    for(const t of threads){const m=t.last_incoming;if(isIncoming(m))readCursors[pid][t.character.id]=m.id;}
    saveReadCursors();
  }
  inboxSnapshot={profileId:pid,threads};
  updateNavUnread();
  return true;
}
function threadHasUnread(thread,pid=state.activeId){
  const m=thread?.last_incoming;
  return isIncoming(m)&&readCursors[pid]?.[thread.character.id]!==m.id;
}
function updateNavUnread(){
  const count=inboxSnapshot.profileId===state.activeId?inboxSnapshot.threads.filter(t=>threadHasUnread(t)).length:0;
  for(const button of document.querySelectorAll('#side-nav [data-tab="messages"],#mobile-nav [data-tab="messages"]')){
    let dot=button.querySelector('.nav-unread-dot');
    if(count&&!dot){dot=document.createElement('span');dot.className='nav-unread-dot';dot.setAttribute('aria-hidden','true');button.append(dot);}
    if(!count&&dot)dot.remove();
    button.setAttribute('aria-label',count?'消息，'+count+' 个未读会话':'消息');
  }
}
function markDisplayedIncomingRead(){
  if(state.tab!=='messages'||!state.threadId||document.hidden)return;
  const m=state.messages.filter(x=>isIncoming(x)&&!state.hiddenReplyIds.has(x.id)).at(-1);
  if(!m)return;
  const pid=state.activeId,cid=state.threadId;
  if((m.profile_id&&m.profile_id!==pid)||(m.character_id&&m.character_id!==cid))return;
  const map=readCursors[pid]||(readCursors[pid]={});
  if(map[cid]!==m.id){map[cid]=m.id;saveReadCursors();}
  updateNavUnread();
}
async function refreshInboxSnapshot(pid=state.activeId){
  if(!pid)return null;
  const seq=++inboxRequestSeq;
  const r=await api('/threads?profileId='+encodeURIComponent(pid));
  if(seq!==inboxRequestSeq||pid!==state.activeId)return null;
  const threads=r.threads||[];
  applyInboxSnapshot(pid,threads);
  return threads;
}
function refreshInboxQuietly(pid=state.activeId){if(pid===state.activeId)void refreshInboxSnapshot(pid).catch(()=>{});}

async function loadThreads(preselect){$('topbar-actions').innerHTML=`<button class="btn soft" data-action="go-discover">${I('sparkleheart')} 继续发现</button>${renderProfileDropdownHtml()}`;if(!activeProfile())return $('view').innerHTML=empty('dog','先创建 Profile','消息会按你当前扮演的身份分别展示。','创建 Profile','profile');const pid=state.activeId;const threads=await refreshInboxSnapshot(pid);if(!threads||state.tab!=='messages'||pid!==state.activeId)return;state.threads=threads;if(preselect)state.threadId=preselect;if(!state.threads.find(x=>x.character.id===state.threadId))state.threadId=window.innerWidth>580?(state.threads[0]?.character.id||''):'';if(state.threadId)await loadThread(state.threadId,false);else renderMessages()}
function isCharacterTyping(){
  return Boolean(state.flushBusy||state.queue?.status==='inflight'||state.revealingBubbles||(state.chatBusy&&state.chatMode==='meeting'));
}
async function loadThread(cid,render=true){
  const existingInput=$('chat-input');
  if(existingInput&&state.renderedThreadId)state.draftInputs[state.renderedThreadId]=existingInput.value;
  const pid=state.activeId,seq=++threadRequestSeq;
  const r=await api('/thread?profileId='+encodeURIComponent(pid)+'&characterId='+encodeURIComponent(cid));
  if(seq!==threadRequestSeq||state.tab!=='messages'||state.activeId!==pid)return;
  state.threadId=cid;
  state.messages=r.messages||[];
  state.meetings=r.meetings||[];
  if(r.surveillance)state.surveillanceMap[cid]=r.surveillance;
  if(r.diarySummary)state.diarySummaryMap[cid]=r.diarySummary;
  const tItem=state.threads.find(x=>x.character.id===cid);
  if(tItem){if(r.character)tItem.character=r.character;tItem.last_incoming=state.messages.filter(isIncoming).at(-1)||null;}
  state.chatMode=r.relation.mode;
  state.hotChat=Boolean(r.relation.hot_chat||r.queue?.hotChat);
  state.activeMeetingId=r.relation.active_meeting_id||'';
  state.meetingLocation=r.relation.meeting_location||'';
  state.queue=r.queue||{count:0,pendingIds:[],dueAt:0,status:'idle',blocked:false,paceMode:state.hotChat?'hot':'daily',hotChat:state.hotChat};
  if(state.settings?.mode==='live'&&r.surveillance?.engine!=='live'){
    const pid=state.activeId;
    api('/surveillance',{profileId:pid,characterId:cid}).then(surv=>{
      if(surv&&state.activeId===pid)state.surveillanceMap[cid]=surv;
    }).catch(()=>{});
  }
  if(render)renderMessages();else renderMessages();
}
function renderMessagesListItems(){
  return `<div class="threads-header">CONNECTIONS · ${state.threads.length}</div>${state.threads.map(x=>{
    const rawLast=(x.last?.engine==='recalled'||x.last?.recalled)?'撤回了一条消息':(x.last?.text||'刚刚匹配');
    const lastTxt=cleanBodyText(rawLast,x.last?.sender||'ai');
    const dName=displayName(x.character);
    const hasNick=Boolean(x.character.nickname&&x.character.nickname!==x.character.name);
    return `<button class="thread-card ${x.character.id===state.threadId?'active':''}" data-action="select-thread" data-id="${esc(x.character.id)}">${avatar({...x.character,avatar:x.character.portrait})}<span class="thread-text"><b>${esc(dName)}${hasNick?`<span class="thread-truename-hint">（${esc(x.character.name)}）</span>`:''}${threadHasUnread(x)?'<span class="thread-unread-badge" title="有新消息" aria-label="有未读消息"></span>':''}</b><p>${esc(lastTxt)}</p></span></button>`;
  }).join('')}`;
}
function formatNovelParagraphs(text,sender='ai'){
  const cleaned=cleanBodyText(text||'',sender,true);
  const parts=String(cleaned||'').split(/\n+/).map(s=>s.trim()).filter(Boolean);
  if(!parts.length)return `<p>${esc(cleaned||'')}</p>`;
  return parts.map(p=>`<p>${esc(p)}</p>`).join('');
}
function findOrBuildMeetingRecord(block,c){
  const pName=activeProfile()?.name||'你';
  const blockIds=new Set(block.map(m=>m.id));
  const firstId=block[0]?.id||'';
  const explicitMid=block.find(m=>m.meeting_id)?.meeting_id||('meet_'+firstId);
  const matched=(state.meetings||[]).find(r=>r.id===explicitMid||(r.message_ids||[]).some(id=>blockIds.has(id)));
  if(matched)return matched;
  const loc=state.meetingLocation||'约定的街角咖啡馆';
  const startedAt=block[0]?.created_at||'';
  const timeStr=startedAt?startedAt.slice(0,16).replace('T',' '):fmtTime(startedAt);
  const uTurns=block.filter(m=>m.sender==='user');
  const aTurns=block.filter(m=>m.sender==='ai');
  let summary=`和 ${pName} 在${loc}见了一面。`;
  if(uTurns.length){
    summary=`和 ${pName} 在${loc}见面，${pName}「${uTurns[0].text.slice(0,36)}」，与 ${c.name} 面对面互动了 ${block.length} 段。`;
  }else if(aTurns.length){
    summary=`和 ${pName} 在${loc}碰面：${cleanBodyText(aTurns[0].text,'ai').slice(0,46)}…`;
  }
  return {
    id:explicitMid,
    location:loc,
    time:timeStr,
    summary,
    entries:block.map(m=>({id:m.id,sender:m.sender,speaker:m.sender==='user'?pName:c.name,text:cleanBodyText(m.text,m.sender,true),created_at:m.created_at}))
  };
}
function renderChatMessagesHtml(c){
  const pendingSet=new Set(state.queue?.pendingIds||[]);
  const charTyping=isCharacterTyping();
  const visibleMsgs=state.messages.filter(m=>!(state.hiddenReplyIds&&state.hiddenReplyIds.has(m.id))&&!(m.sender==='ai'&&m.mode!=='meeting'&&m.engine!=='recalled'&&!m.recalled&&/^[\s|｜]*[|｜]{2,}[\s|｜]*$/.test(cleanBodyText(m.text,m.sender))));
  const pName=activeProfile()?.name||'你';
  if(state.chatMode==='meeting'){
    let sessionMsgs=[];
    for(let i=visibleMsgs.length-1;i>=0;i--){
      const m=visibleMsgs[i];
      if(m.mode==='meeting'){
        if(state.activeMeetingId&&m.meeting_id&&m.meeting_id!==state.activeMeetingId&&m.id!=='pending'&&m.id!=='typing')break;
        sessionMsgs.unshift(m);
      }else{
        break;
      }
    }
    const locVal=state.meetingLocation||(sessionMsgs.length?findOrBuildMeetingRecord(sessionMsgs,c).location:'约定的街角咖啡馆');
    const turnsHtml=sessionMsgs.filter(m=>m.id!=='typing').map((m,idx)=>{
      const isUser=m.sender==='user';
      return `<article class="novel-turn ${isUser?'novel-user':'novel-ai'}">
        <header class="novel-turn-head">
          <span class="novel-speaker">${isUser?`${esc(pName)} · 你的行动与台词`:`${esc(c.name)} · 现场描写`}</span>
          <span class="novel-turn-meta">#${idx+1} · ${fmtTime(m.created_at)}${m.engine==='demo'?' · 演示':''}</span>
        </header>
        <div class="novel-prose">${formatNovelParagraphs(m.text,m.sender)}</div>
      </article>`;
    }).join('');
    const emptyNovelHtml=(!turnsHtml&&!charTyping)?`<div class="novel-empty-card">
      <div class="kicker">FACE-TO-FACE NOVEL MODE</div>
      <h3>与 ${esc(c.name)} 的面对面互动</h3>
      <p>当前已进入独立文字小说页面（上方气泡聊天已折叠收起）。你可以在下方写下你的动作或台词，或者让 ${esc(c.name)} 先描写见面的第一幕。</p>
      <button type="button" class="btn soft" data-action="continue-reply">${I('book')} 让 ${esc(c.name)} 描写见面开场</button>
    </div>`:'';
    const typingNovelHtml=charTyping?`<div class="typing-inline novel-typing" role="status" aria-live="polite"><span class="typing-label">${esc(c.name)} 正在描写现场反应</span><span class="typing-ellipsis"><i>.</i><i>.</i><i>.</i></span></div>`:'';
    return `<div class="meeting-novel-stage">
      <div class="meeting-stage-bar">
        <div class="meeting-loc-pill">
          ${I('map')}
          <span>见面地点</span>
          <input id="meeting-location-input" class="meeting-loc-input" type="text" maxlength="36" value="${esc(locVal)}" placeholder="如：街角咖啡馆门口" title="可随时修改本次见面地点，结束见面后将写入见面卡片">
        </div>
        <span class="meeting-stage-hint">文字小说模式 · 点击右上角「结束见面」将归档为见面卡片</span>
      </div>
      <div class="meeting-novel-pages">
        ${emptyNovelHtml}
        ${turnsHtml}
        ${typingNovelHtml}
      </div>
    </div>`;
  }
  // Chat mode: render SMS bubbles and collapse contiguous meeting sessions into clickable .meeting-card
  const blocks=[];
  let curMeeting=[];
  for(const m of visibleMsgs){
    if(m.id==='typing')continue;
    const mode=m.mode||'chat';
    if(mode==='meeting'){
      const prevMid=curMeeting[0]?.meeting_id||'';
      if(curMeeting.length&&m.meeting_id&&prevMid&&m.meeting_id!==prevMid){
        blocks.push({type:'meeting_group',msgs:curMeeting});
        curMeeting=[m];
      }else{
        curMeeting.push(m);
      }
    }else{
      if(curMeeting.length){
        blocks.push({type:'meeting_group',msgs:curMeeting});
        curMeeting=[];
      }
      blocks.push({type:'chat_msg',msg:m});
    }
  }
  if(curMeeting.length)blocks.push({type:'meeting_group',msgs:curMeeting});

  const htmlParts=blocks.map(b=>{
    if(b.type==='meeting_group'){
      const rec=findOrBuildMeetingRecord(b.msgs,c);
      return `<div class="meeting-card" data-action="open-meeting-record" data-id="${esc(rec.id)}" role="button" tabindex="0" title="点击查看本次完整见面记录">
        <div class="meeting-card-head">
          <span class="meeting-card-badge">${I('book')} 见面回忆卡片</span>
          <span class="meeting-card-count">共 ${b.msgs.length} 段记录</span>
        </div>
        <div class="meeting-card-rows">
          <div class="meeting-card-row"><b>见面地点</b><span class="inline-ic-text">${I('map','inline-doodle-ic')}<span>${esc(rec.location||'约定的街角咖啡馆')}</span></span></div>
          <div class="meeting-card-row"><b>见面时间</b><span class="inline-ic-text">${I('clock','inline-doodle-ic')}<span>${esc(rec.time||fmtTime(b.msgs[0]?.created_at))}</span></span></div>
          <div class="meeting-card-row is-summary"><b>见面梗概</b><span class="inline-ic-text">${I('book','inline-doodle-ic')}<span>${esc(rec.summary)}</span></span></div>
        </div>
        <div class="meeting-card-foot">
          <span>点击卡片阅读本次见面的完整文字小说记录</span>
          <span class="meeting-card-cta">查看见面记录 ${I('arrow')}</span>
        </div>
      </div>`;
    }
    const m=b.msg;
    if(m.engine==='recalled'||m.recalled){
      return `<div class="recall-notice" data-recalled-id="${esc(m.id)}">${I('refresh','recall-ic')}<span>${m.sender==='user'?'你撤回了一条消息':`${esc(c.name)} 撤回了一条消息`}</span></div>`;
    }
    const canRecall=m.sender==='user'&&m.id&&m.id!=='pending'&&m.id!=='typing';
    const recallBtn=canRecall?`<button type="button" class="msg-del-btn" data-action="delete-message" data-id="${esc(m.id)}" title="撤回此条消息" aria-label="撤回此条消息">撤回</button>`:'';
    let receiptHtml='';
    if(m.sender==='user'){
      const isUnread=(m.id==='pending'||(pendingSet.has(m.id)&&!charTyping));
      receiptHtml=isUnread
        ?`<span class="msg-receipt is-sent" title="已发出">${I('sent','receipt-ic')}<em>已发出</em></span>`
        :`<span class="msg-receipt is-read" title="对方已读">${I('read','receipt-ic')}<em>已读</em></span>`;
    }
    const time=`<span>${fmtTime(m.created_at)}${m.engine==='demo'?' · 演示回复':''}${m.engine==='error'?' · 接口错误':''}</span>${receiptHtml}${recallBtn}`;
    return `<div class="bubble-row ${m.sender==='user'?'mine':''}">${m.sender==='ai'?avatar({...c,avatar:c.portrait}):''}<div><div class="bubble">${esc(cleanBodyText(m.text,m.sender))}</div><div class="chat-time">${time}</div></div></div>`;
  }).join('');

  const typingHtml=charTyping?`<div class="typing-inline" role="status" aria-live="polite"><span class="typing-label">对方正在输入中</span><span class="typing-ellipsis"><i>.</i><i>.</i><i>.</i></span></div>`:'';
  return htmlParts+typingHtml;
}
function renderHeaderModeButton(meeting){
  if(meeting){
    return `<button type="button" class="btn soft end-meeting-btn" data-action="change-mode" aria-label="结束见面" title="结束本次见面并回退到聊天页面，生成见面卡片">${I('message')}<span>结束见面</span></button>`;
  }
  const isHot=Boolean(state.hotChat);
  const hotTitle=isHot
    ?'当前：热聊模式 · 点击切换回日常模式'
    :'当前：日常模式 · 点击开启热聊模式';
  return `<button type="button" class="icon-btn hot-chat-btn ${isHot?'is-hot':''}" data-action="toggle-hot-chat" aria-pressed="${isHot?'true':'false'}" aria-label="${isHot?'热聊模式已开启':'开启热聊模式'}" title="${hotTitle}">${I('hotchat')}</button><button type="button" class="icon-btn mode-icon-btn" data-action="change-mode" aria-label="进入面对面见面" title="进入面对面见面">${I('map')}</button>`;
}
function renderMessages(){
  if(state.tab!=='messages')return;
  markDisplayedIncomingRead();
  const selected=state.threads.find(x=>x.character.id===state.threadId);
  const existingInput=$('chat-input');
  const wasFocused=existingInput&&document.activeElement===existingInput;
  const selStart=existingInput?existingInput.selectionStart:null;
  const selEnd=existingInput?existingInput.selectionEnd:null;
  if(existingInput&&state.renderedThreadId){
    state.draftInputs[state.renderedThreadId]=existingInput.value;
  }
  const existingLoc=$('meeting-location-input');
  if(existingLoc&&state.chatMode==='meeting'){
    state.meetingLocation=existingLoc.value.trim()||state.meetingLocation;
  }
  const isBusy=state.chatBusy||state.flushBusy||state.queue?.status==='inflight';
  const charTyping=isCharacterTyping();
  // Surgical update when staying on the same thread so typing in #chat-input is never interrupted
  const layoutEl=document.querySelector('#view .messages-layout');
  const chatBodyEl=$('chat-body');
  if(selected&&layoutEl&&chatBodyEl&&existingInput&&state.renderedThreadId===state.threadId){
    const threadsEl=layoutEl.querySelector('.threads');
    if(threadsEl)threadsEl.innerHTML=renderMessagesListItems();
    const meeting=state.chatMode==='meeting';
    const chatViewEl=layoutEl.querySelector('.chat-view');
    if(chatViewEl)chatViewEl.classList.toggle('meeting-mode',meeting);
    const nameEl=layoutEl.querySelector('.chat-heading-text b');
    if(nameEl){
      nameEl.textContent=displayName(selected.character);
      nameEl.title=displayName(selected.character);
    }
    const subEl=layoutEl.querySelector('.chat-heading small');
    if(subEl){
      const c=selected.character;
      const subText=c.nickname?`原名：${c.name} · ${c.version}`:c.version;
      subEl.className=charTyping?'typing-header-hint':'';
      subEl.textContent=charTyping?'对方正在输入中…':subText;
    }
    const modeSlot=layoutEl.querySelector('#chat-mode-btn-slot');
    if(modeSlot)modeSlot.innerHTML=renderHeaderModeButton(meeting);
    chatBodyEl.className=`chat-body ${meeting?'meeting-novel-body':''}`;
    chatBodyEl.innerHTML=renderChatMessagesHtml(selected.character);
    chatBodyEl.scrollTop=chatBodyEl.scrollHeight;
    existingInput.placeholder=meeting?'写下你在见面时的动作、神态或台词……':'输入消息……';
    const sendBtn=layoutEl.querySelector('#chat-form .send');
    if(sendBtn)sendBtn.disabled=isBusy;
    const plusBtn=layoutEl.querySelector('#chat-form .chat-plus-btn');
    if(plusBtn){
      plusBtn.classList.toggle('active',Boolean(state.chatPlusOpen));
      plusBtn.setAttribute('aria-expanded',state.chatPlusOpen?'true':'false');
    }
    const plusPanel=$('chat-plus-panel');
    if(plusPanel)plusPanel.classList.toggle('open',Boolean(state.chatPlusOpen));
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
    input.addEventListener('input',e=>{if(state.threadId){state.draftInputs[state.threadId]=e.target.value;state.lastSendAt=Date.now()}});
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
  const dName=displayName(c);
  const subText=c.nickname?`原名：${c.name} · ${c.version}`:c.version;
  const meeting=state.chatMode==='meeting';
  const isBusy=state.chatBusy||state.flushBusy||state.queue?.status==='inflight';
  const charTyping=isCharacterTyping();
  const plusOpen=Boolean(state.chatPlusOpen);
  const plusItemsHtml=CHAT_PLUS_ITEMS.map(item=>`<button type="button" class="chat-plus-item" data-action="chat-plus-item" data-feature="${item.id}" data-label="${item.label}">
    <span class="chat-plus-icon">${I(item.icon)}</span>
    <span class="chat-plus-label">${item.label}</span>
  </button>`).join('');
  return `<div class="chat-header"><div class="chat-heading"><button class="icon-btn mobile-back" data-action="back-threads" aria-label="返回列表" title="返回列表">${I('back')}</button><button type="button" class="chat-avatar-trigger" data-action="open-char-hub" aria-label="打开角色专属空间" title="点击打开角色专属空间（监控、日记、记忆档案与备注）">${avatar({...c,avatar:c.portrait})}<div class="chat-heading-text"><b title="${esc(dName)}">${esc(dName)}</b><small class="${charTyping?'typing-header-hint':''}" title="${esc(subText)}">${charTyping?'对方正在输入中…':esc(subText)}</small></div></button></div><div class="chat-header-actions"><span id="chat-mode-btn-slot">${renderHeaderModeButton(meeting)}</span><button type="button" class="icon-btn danger-icon" data-action="unmatch" aria-label="解除匹配" title="解除匹配">${I('unmatch')}</button></div></div><div id="chat-body" class="chat-body ${meeting?'meeting-novel-body':''}">${renderChatMessagesHtml(c)}</div><form id="chat-form" class="chat-compose"><textarea id="chat-input" rows="1" placeholder="${meeting?'写下你在见面时的动作、神态或台词……':'输入消息……'}" maxlength="4000" required></textarea><button class="send" type="submit" title="发送消息" ${isBusy?'disabled':''}>${I('send')}</button><button class="chat-plus-btn ${plusOpen?'active':''}" type="button" data-action="toggle-chat-plus" aria-label="更多功能" aria-expanded="${plusOpen?'true':'false'}" title="更多功能（照片、语音、表情包、电话、视频电话）">${I('plus')}</button></form><div id="chat-plus-panel" class="chat-plus-panel ${plusOpen?'open':''}" role="region" aria-label="聊天扩展功能面板"><div class="chat-plus-grid">${plusItemsHtml}</div></div><div class="chat-queue-status" id="chat-queue-status" aria-live="polite"></div>`;
}
function openCharacterHubModal(editingNick=false){
  const thread=state.threads.find(x=>x.character.id===state.threadId);
  if(!thread)return;
  const c=thread.character;
  const dName=displayName(c);
  const hasNick=Boolean(c.nickname&&c.nickname.trim());
  const surv=state.surveillanceMap[c.id];
  const curLoc=surv?.current?.location||'';
  const dSum=state.diarySummaryMap[c.id];
  const latestDiaryHint=dSum?.latestDate?`最新：${dSum.latestDate} 日记`:'每日 00:00 自动生成';
  const html=`<div class="kicker">CHARACTER POCKET · 角色专属空间</div>
    <div class="char-hub-header">
      <div class="char-hub-top">
        ${avatar({...c,avatar:c.portrait},'mini-avatar char-hub-avatar')}
        <div class="char-hub-title">
          <button type="button" class="char-hub-name-btn" data-action="toggle-nickname-edit" title="点击角色名字修改专属备注（留空恢复原名）">
            <span class="char-hub-display-name">${esc(dName)}</span>
            <span class="char-hub-edit-pill">${I('edit')}<span>${hasNick?'改备注':'备注'}</span></span>
          </button>
          <div class="char-hub-source-line">${esc(c.source)} · ${esc(c.version)}</div>
        </div>
      </div>
      <div id="char-hub-nick-editor" class="char-hub-nick-editor" style="display:${editingNick?'grid':'none'}">
        <input id="char-hub-nick-input" type="text" maxlength="36" value="${esc(c.nickname||'')}" placeholder="输入给 TA 的备注名（留空恢复原名）">
        <div class="char-hub-nick-actions">
          ${hasNick?`<button type="button" class="btn soft tiny-btn" data-action="reset-nickname">恢复原名</button>`:''}
          <button type="button" class="btn ghost tiny-btn" data-action="cancel-nickname">取消</button>
          <button type="button" class="btn primary tiny-btn" data-action="save-nickname">${I('check')} 保存备注</button>
        </div>
      </div>
      <div class="char-hub-truename-bar">
        <span class="truename-tag">角色真名：<b>${esc(c.name)}</b></span>
        <span class="truename-status">${hasNick?`已设备注：${esc(dName)}`:'未设备注 · 显示原名'}</span>
      </div>
    </div>
    <div class="char-hub-grid">
      <button type="button" class="char-hub-item" data-action="open-surveillance" title="查看角色此刻在哪、在做什么，或选择日期查看过往角色经历">
        <span class="char-hub-ic">${I('monitor')}</span>
        <b>实时监控</b>
        <small>${esc(curLoc?`此刻在：${curLoc}`:'查看实时画面与过往行踪')}</small>
      </button>
      <button type="button" class="char-hub-item" data-action="open-diary" title="每日 00:00 根据前日监控自动生成角色私密日记，可按日期翻阅过往">
        <span class="char-hub-ic">${I('diary')}</span>
        <b>角色日记</b>
        <small>${esc(latestDiaryHint)}</small>
      </button>
      <button type="button" class="char-hub-item" data-action="open-memories" title="查看与管理该角色的记忆档案">
        <span class="char-hub-ic">${I('book')}</span>
        <b>记忆档案</b>
        <small>查看见面回忆与按日归档</small>
      </button>
      <button type="button" class="char-hub-item is-placeholder" disabled title="即将推出">
        <span class="char-hub-ic">${I('compass')}</span>
        <b>待定功能</b>
        <small>预留专属空间槽位</small>
      </button>
    </div>`;
  modal(html,`<button class="btn soft" data-action="close-modal">关闭</button>`);
  if(editingNick){
    setTimeout(()=>{$('char-hub-nick-input')?.focus();$('char-hub-nick-input')?.select()},40);
  }
}
async function saveCharacterNickname(nickValue){
  const thread=state.threads.find(x=>x.character.id===state.threadId);
  if(!thread||!state.activeId)return;
  const clean=String(nickValue??'').trim().slice(0,36);
  try{
    const r=await api('/nickname',{profileId:state.activeId,characterId:thread.character.id,nickname:clean});
    if(r.character)thread.character=r.character;
    else thread.character.nickname=clean;
    renderMessages();
    openCharacterHubModal(false);
    toast(clean?`已将备注修改为「${clean}」`:`已恢复显示原名「${thread.character.name}」`);
  }catch(e){toast('修改备注失败：'+e.message)}
}
async function openSurveillanceModal(forceRefresh=false,selectedDate=''){
  const thread=state.threads.find(x=>x.character.id===state.threadId);
  if(!thread||!state.activeId)return;
  const c=thread.character;
  const dName=displayName(c);
  try{
    const data=await api('/surveillance',{profileId:state.activeId,characterId:c.id,date:selectedDate||'',refresh:Boolean(forceRefresh)});
    if(data.isToday!==false)state.surveillanceMap[c.id]=data;
    const isToday=data.isToday!==false;
    const cur=data.current||{};
    const unlocked=data.unlockedSlots||[];
    const lockedCount=Number(data.lockedCount||0);
    const todayStr=data.today||localDateStr();
    const curDateVal=data.date||todayStr;
    const sourceBadge=s=>{
      if(s.isCurrent)return '正在进行';
      if(s.source==='meeting')return '线下见面足迹';
      if(s.source==='meeting_shift')return '见面后行程';
      if(s.source==='chat_update')return '聊天动态同步';
      return s.status||'已发生';
    };
    const html=`<div class="kicker">LIVE SURVEILLANCE · 角色行踪监控</div>
      <div class="modal-head-bar">
        <div class="modal-head-titles">
          <h2>${esc(dName)} 的${isToday?'实时监控':'过往经历监控'}</h2>
          <p class="caption">${esc(curDateVal)} · ${isToday?`当前时间 ${esc(data.nowTime||fmtTime(new Date().toISOString()))} · 与聊天及见面地点双向实时同步`:'过往日期全天 00:00–23:59 经历归档'}</p>
        </div>
        <div class="modal-head-controls">
          <div class="modal-date-picker" data-action="open-date-picker" title="点击打开日历选择日期">
            ${I('calendar')}
            <input type="date" id="surv-date-input" class="modal-date-input" value="${esc(curDateVal)}" max="${esc(todayStr)}" aria-label="选择监控日期">
          </div>
          ${!isToday?`<button type="button" class="btn soft tiny-btn" data-action="select-surv-date" data-date="${esc(todayStr)}">回到今日</button>`:''}
          ${state.settings?.mode==='live'?`<button type="button" class="btn soft tiny-btn" data-action="refresh-surveillance" data-date="${esc(curDateVal)}">${I('refresh')} 同步</button>`:''}
        </div>
      </div>
      ${isToday?`<div class="surv-live-card">
        <div class="surv-live-head">
          <span class="surv-live-badge"><i class="surv-live-dot"></i> 此刻实时画面 · ${esc(cur.status||'日常活动')}</span>
          <span class="surv-live-time">${esc(cur.start||'00:00')} – ${esc(cur.end||'23:59')}</span>
        </div>
        <div class="surv-live-loc">${I('map')}<span>${esc(cur.location||`${c.name}的常去地点`)}</span></div>
        <div class="surv-live-act">${esc(cur.activity||'正在处理日常事务')}</div>
        <div class="surv-live-scene">${esc(cur.scene||`${c.name}正在当下所在的位置处理日常事务。`)}</div>
        <div class="surv-live-actions">
          <span class="caption">如果在聊天中直接点「进入见面」，将默认前往该实时地点</span>
          ${state.chatMode==='chat'?`<button type="button" class="btn primary tiny-btn" data-action="surv-enter-meeting" data-loc="${esc(cur.location||'')}">${I('map')} 前往此处与 TA 见面</button>`:`<span class="pill">当前正在线下见面中</span>`}
        </div>
      </div>`:''}
      <div class="surv-section-head">
        <h3>${isToday?'今日已发生足迹（随时间自然解锁）':`${esc(curDateVal)} 全天经历回溯`}</h3>
        <span class="caption">已解锁 ${unlocked.length} / ${data.totalSlotsCount||unlocked.length} 个时段</span>
      </div>
      <div class="surv-timeline">
        ${unlocked.map(s=>`<div class="surv-slot ${s.isCurrent?'is-current':''} ${s.source==='meeting'?'is-meeting':''}">
          <div class="surv-slot-top">
            <span class="surv-slot-time">${esc(s.start)} – ${esc(s.end)}</span>
            <span class="surv-slot-loc">${I('map')}<span>${esc(s.location)}</span></span>
            <span class="surv-slot-tag">${esc(sourceBadge(s))}</span>
          </div>
          <div class="surv-slot-act">${esc(s.activity)}</div>
          ${(!isToday&&s.scene)?`<div class="surv-slot-scene">${esc(s.scene)}</div>`:''}
        </div>`).join('')}
      </div>
      ${lockedCount>0?`<div class="surv-locked-note">${I('clock')}<span>今日后续还有 ${lockedCount} 个未到时间的行程时段，将随现实时间推进自动解锁，也可由你们接下来的聊天与见面动态改写。</span></div>`:''}`;
    modal(html,`<button class="btn soft" data-action="open-char-hub">返回角色空间</button><button class="btn primary" data-action="close-modal">关闭监控</button>`);
    const mEl=document.querySelector('#modal-root .modal');
    if(mEl)mEl.classList.add('modal-wide');
  }catch(e){toast('读取实时监控失败：'+e.message)}
}
async function openDiaryModal(selectedDate='',forceRefresh=false){
  const thread=state.threads.find(x=>x.character.id===state.threadId);
  if(!thread||!state.activeId)return;
  const c=thread.character;
  const dName=displayName(c);
  try{
    const data=await api('/diary',{profileId:state.activeId,characterId:c.id,date:selectedDate||'',refresh:Boolean(forceRefresh)});
    state.diaryMap[c.id]=data;
    state.diarySummaryMap[c.id]={latestDate:data.latestDate,availableDates:data.availableDates,latestTitle:data.diary?.title||''};
    const diary=data.diary||{};
    const isLatest=(diary.date===data.latestDate);
    const curDiaryDate=diary.date||data.latestDate||localDateStr();
    const maxDiaryDate=data.latestDate||localDateStr();
    const footprints=Array.isArray(diary.footprints)?diary.footprints:[];
    const html=`<div class="kicker">CHARACTER DIARY · 角色私密日记</div>
      <div class="modal-head-bar">
        <div class="modal-head-titles">
          <h2>${esc(dName)} 的日记本</h2>
          <p class="caption">系统于每日 00:00 根据前日监控行踪自动执笔 · 默认仅展示单篇日记</p>
        </div>
        <div class="modal-head-controls">
          <div class="modal-date-picker" data-action="open-date-picker" title="点击打开日历选择日记日期">
            ${I('calendar')}
            <input type="date" id="diary-date-input" class="modal-date-input" value="${esc(curDiaryDate)}" max="${esc(maxDiaryDate)}" aria-label="选择日记日期">
          </div>
          ${!isLatest?`<button type="button" class="btn soft tiny-btn" data-action="select-diary-date" data-date="${esc(maxDiaryDate)}">最新一篇</button>`:''}
          ${state.settings?.mode==='live'?`<button type="button" class="btn soft tiny-btn" data-action="refresh-diary" data-date="${esc(curDiaryDate)}">${I('refresh')} 重新执笔</button>`:''}
        </div>
      </div>
      <article class="diary-sheet">
        <header class="diary-sheet-head">
          <div class="diary-meta-pills">
            <span class="diary-date-pill">${I('calendar')}<span>${esc(curDiaryDate)}${isLatest?' · 最新一篇':' · 过往日记'}</span></span>
            <span class="diary-meta-tag">天气：${esc(diary.weather||'晴朗微风')}</span>
            <span class="diary-meta-tag">心情：${esc(diary.mood||'专注沉稳')}</span>
          </div>
          <span class="diary-focus-badge ${diary.intimacy_stage==='deep_love'?'is-deeplove':''}" title="${esc(data.intimacy?.desc||'')}">${esc(diary.intimacy_label||data.intimacy?.label||'独立生活 · 自有天地')}</span>
        </header>
        <h3 class="diary-title">${esc(diary.title||`《${c.name}的日常手记》`)}</h3>
        <div class="diary-prose">${formatNovelParagraphs(diary.content||'')}</div>
        <footer class="diary-sheet-foot">
          <div class="diary-foot-top">
            <span class="caption">${I('monitor','inline-doodle-ic')} <b>本文源自 ${esc(curDiaryDate)} 的角色监控经历：</b></span>
            <button type="button" class="btn ghost tiny-btn" data-action="select-surv-date" data-date="${esc(curDiaryDate)}">${I('monitor')} 查看当日监控记录</button>
          </div>
          ${footprints.length?`<div class="diary-footprint-chips">${footprints.map(f=>`<span class="diary-fp-chip">${esc(f)}</span>`).join('')}</div>`:''}
        </footer>
      </article>`;
    modal(html,`<button class="btn soft" data-action="open-char-hub">返回角色空间</button><button class="btn primary" data-action="close-modal">合上日记</button>`);
    const mEl=document.querySelector('#modal-root .modal');
    if(mEl)mEl.classList.add('modal-wide');
  }catch(e){toast('读取角色日记失败：'+e.message)}
}
const MEM_SOURCE_LABEL={
  meeting_summary:'见面回忆',
  confirmed_fact:'重要记忆/设定',
  dialogue:'重要约定',
  'daily-summary':'每日聊天归档',
  daily_summary:'每日聊天归档',
  correction:'已澄清纠正',
  milestone:'关系节点',
  direct_experience:'亲历互动',
  spoken_claim:'重要陈述',
  inference:'推断印象'
};
function openMeetingRecordModal(meetingId){
  const thread=state.threads.find(x=>x.character.id===state.threadId);
  const c=thread?.character||{name:'角色'};
  let rec=(state.meetings||[]).find(x=>x.id===meetingId)||
    (state.lastMemoriesData?.meetings||[]).find(x=>x.id===meetingId)||
    (state.lastMemoriesData?.memories||[]).find(x=>x.meeting_id===meetingId)?.meeting_data||null;
  if(!rec){
    const mMsgs=state.messages.filter(m=>m.mode==='meeting'&&(m.meeting_id===meetingId||('meet_'+m.id)===meetingId));
    if(mMsgs.length)rec=findOrBuildMeetingRecord(mMsgs,c);
    else{
      const allMeet=state.messages.filter(m=>m.mode==='meeting');
      if(allMeet.length)rec=findOrBuildMeetingRecord(allMeet,c);
    }
  }
  if(!rec){toast('未找到该次见面的详细记录');return}
  const entries=rec.entries||[];
  const html=`<div class="kicker">MEETING RECORD · 线下见面完整记录</div>
    <h2>与 ${esc(c.name)} 的见面记录</h2>
    <div class="meeting-modal-meta">
      <div class="inline-ic-text">${I('map','inline-doodle-ic')}<b>见面地点：</b><span>${esc(rec.location||'约定的街角咖啡馆')}</span></div>
      <div class="inline-ic-text">${I('clock','inline-doodle-ic')}<b>见面时间：</b><span>${esc(rec.time||'近期')}</span></div>
      <div class="inline-ic-text">${I('book','inline-doodle-ic')}<b>见面梗概：</b><span>${esc(rec.summary||'')}</span></div>
    </div>
    <div class="meeting-modal-transcript">
      ${entries.length?entries.map((e,idx)=>`<article class="novel-turn ${e.sender==='user'?'novel-user':'novel-ai'}">
        <header class="novel-turn-head">
          <span class="novel-speaker">${esc(e.speaker||(e.sender==='user'?'你':c.name))}</span>
          <span class="novel-turn-meta">#${idx+1} · ${fmtTime(e.created_at)}</span>
        </header>
        <div class="novel-prose">${formatNovelParagraphs(e.text,e.sender)}</div>
      </article>`).join(''):'<p class="caption">暂无详细段落记录。</p>'}
    </div>`;
  modal(html,`<button class="btn soft" data-action="close-modal">关闭见面记录</button>`);
  const mEl=document.querySelector('#modal-root .modal');
  if(mEl)mEl.classList.add('modal-wide');
}
function openDailyMessagesModal(memId){
  const mem=(state.lastMemoriesData?.memories||[]).find(x=>x.id===memId);
  if(!mem){toast('未找到当日对话详情');return}
  const msgs=mem.day_messages||[];
  const html=`<div class="kicker">DAILY ARCHIVE · 每日聊天记录详情</div>
    <h2>${esc(mem.summary.split(' ')[0]||'当日')} 聊天明细</h2>
    <p class="caption">${esc(cleanBodyText(mem.summary,mem.source_type==='correction'||mem.source_type==='manual'?'user':'ai'))}</p>
    <div class="daily-modal-messages">
      ${msgs.length?msgs.map(m=>`<div class="daily-msg-row ${m.sender==='user'?'is-user':'is-ai'}">
        <div class="daily-msg-meta"><b>${esc(m.speaker)}</b><span>${fmtTime(m.created_at)}</span></div>
        <div class="daily-msg-text">${esc(cleanBodyText(m.text,m.sender))}</div>
      </div>`).join(''):'<p class="caption">暂无当日明细消息。</p>'}
    </div>`;
  modal(html,`<button class="btn soft" data-action="open-memories">返回记忆档案</button><button class="btn primary" data-action="close-modal">关闭</button>`);
  const mEl=document.querySelector('#modal-root .modal');
  if(mEl)mEl.classList.add('modal-wide');
}
async function openMemoriesModal(query='',category=state.memoryCategory||'all'){
  const thread=state.threads.find(x=>x.character.id===state.threadId);
  if(!thread||!state.activeId)return;
  state.memoryCategory=category;
  const c=thread.character;
  try{
    const qs=`?profileId=${encodeURIComponent(state.activeId)}&characterId=${encodeURIComponent(c.id)}${query?`&query=${encodeURIComponent(query)}`:''}`;
    const data=await api('/memories'+qs);
    state.lastMemoriesData=data;
    if(Array.isArray(data.meetings)&&data.meetings.length)state.meetings=data.meetings;
    const recalled=data.recalledPreview||[];
    const allList=data.memories||[];
    const meetingList=allList.filter(m=>m.source_type==='meeting_summary');
    const importantList=allList.filter(m=>['confirmed_fact','dialogue','correction'].includes(m.source_type));
    const dailyList=allList.filter(m=>m.source_type==='daily-summary'||m.source_type==='daily_summary');
    const filtered=category==='meeting'?meetingList:(category==='important'?importantList:(category==='daily'?dailyList:allList));
    const html=`<div class="kicker">ORGANIZED MEMORY ARCHIVE · 角色专属记忆归档</div>
      <h2>${esc(c.name)} 的记忆档案</h2>
      <p class="caption">已自动过滤琐碎操作与逐句流水账：仅归档<b>「线下见面回忆卡片」</b>、<b>「重要约定与设定」</b>与<b>「每日聊天按日汇总」</b>。点击卡片即可查看详情。</p>
      <div class="memory-layers-grid">
        <div class="memory-layer-box"><b>第一层 · 身份设定</b><span>${esc(c.source)} · ${esc(c.version)}</span></div>
        <div class="memory-layer-box"><b>第二层 · 关系基线</b><span>${esc(data.baseline||'暂无关系事件')}</span></div>
        <div class="memory-layer-box"><b>第四层 · 今日活跃窗口</b><span>携带最近 ${data.workingWindowCount} 条对话（共 ${data.totalMessagesCount} 条）</span></div>
      </div>
      <div class="memory-section">
        <label class="field-label">手动写入重要共同记忆 / 约定</label>
        <div class="source-composer" style="margin-top:6px">
          <input id="memory-add-input" type="text" maxlength="400" placeholder="例如：约定下周五晚一起去看海 / 对方记得我不喝冰美式">
          <button type="button" class="btn primary" data-action="add-memory">${I('plus')} 记录</button>
        </div>
      </div>
      <div class="memory-section">
        <div class="row-between" style="flex-wrap:wrap;gap:8px">
          <div class="memory-cat-tabs">
            <button type="button" class="chip ${category==='all'?'active':''}" data-action="filter-memories" data-cat="all">全部归档 (${allList.length})</button>
            <button type="button" class="chip ${category==='meeting'?'active':''}" data-action="filter-memories" data-cat="meeting">${I('map')} 见面回忆 (${meetingList.length})</button>
            <button type="button" class="chip ${category==='important'?'active':''}" data-action="filter-memories" data-cat="important">${I('spark')} 约定与重点 (${importantList.length})</button>
            <button type="button" class="chip ${category==='daily'?'active':''}" data-action="filter-memories" data-cat="daily">${I('clock')} 按日聊天汇总 (${dailyList.length})</button>
          </div>
        </div>
        <div class="source-composer" style="margin-top:10px">
          <input id="memory-search-input" type="text" placeholder="输入关键词检索过往见面或约定…" value="${esc(query)}">
          <button type="button" class="btn soft" data-action="search-memories">${I('search')} 检索</button>
        </div>
        ${query&&recalled.length?`<div class="memory-recalled-list" style="margin-top:8px">${recalled.map(m=>`<div class="memory-recalled-item">${esc(m.formatted)}</div>`).join('')}</div>`:''}
        <div class="memory-archive-list" style="margin-top:10px">
          ${filtered.length?filtered.map(m=>{
            const isMeeting=m.source_type==='meeting_summary';
            const isDaily=m.source_type==='daily-summary'||m.source_type==='daily_summary';
            const meetId=m.meeting_id||String(m.source_key||'').replace('meeting:','');
            return `<div class="memory-item ${m.disputed?'is-disputed':''} ${isMeeting?'is-meeting-memory':''}">
              <div class="memory-item-top">
                <span class="memory-badge ${esc(m.source_type)}">${esc(MEM_SOURCE_LABEL[m.source_type]||m.source_type)}</span>
                ${m.unresolved?'<span class="memory-badge unresolved">待兑现约定</span>':''}
                ${m.disputed?'<span class="memory-badge disputed">存疑/已纠正</span>':''}
                <span class="memory-date">${esc((m.created_at||'').slice(0,16).replace('T',' '))}</span>
              </div>
              <div class="memory-summary">${esc(m.summary)}</div>
              <div class="memory-item-actions">
                ${isMeeting?`<button type="button" class="btn soft tiny-btn" data-action="open-meeting-record" data-id="${esc(meetId)}">${I('book')} 查看见面详情记录</button>`:''}
                ${isDaily&&m.day_messages?.length?`<button type="button" class="btn soft tiny-btn" data-action="open-daily-messages" data-id="${esc(m.id)}">${I('message')} 查看当日对话 (${m.day_messages.length}条)</button>`:''}
                ${!m.disputed?`<button type="button" class="btn ghost tiny-btn" data-action="prompt-correct-memory" data-id="${esc(m.id)}">澄清/纠正</button>`:''}
                <button type="button" class="btn ghost tiny-btn danger-text" data-action="delete-memory" data-id="${esc(m.id)}">删除</button>
              </div>
              <div class="memory-correct-box" id="mem-correct-${esc(m.id)}" style="display:none">
                <input type="text" id="mem-correct-input-${esc(m.id)}" placeholder="输入真实情况，原记忆将标记为存疑…">
                <button type="button" class="btn soft tiny-btn" data-action="submit-correct-memory" data-id="${esc(m.id)}">确认纠正</button>
              </div>
            </div>`;
          }).join(''):'<div class="caption" style="padding:14px 0">当前分类下暂无归档记录。完成一次线下见面、聊到重要约定或跨日交流后会自动整理归档。</div>'}
        </div>
      </div>`;
    modal(html,`<button class="btn soft" data-action="close-modal">关闭档案</button>`);
    const mEl=document.querySelector('#modal-root .modal');
    if(mEl)mEl.classList.add('modal-wide');
  }catch(e){toast('读取记忆档案失败：'+e.message)}
}
function updateQueueCountdown(){
  const el=$('chat-queue-status');
  if(el)el.textContent='';
}
async function revealMultipleBubbles(replies,profileId,id){
  if(!Array.isArray(replies)||replies.length<=1){
    state.hiddenReplyIds.clear();
    state.revealingBubbles=false;
    if(state.activeId===profileId&&state.threadId===id&&state.tab==='messages')await loadThreads(id);
    else refreshInboxQuietly(profileId);
    return;
  }
  state.hiddenReplyIds=new Set(replies.slice(1).map(x=>x.id));
  state.revealingBubbles=true;
  if(state.activeId===profileId&&state.threadId===id&&state.tab==='messages')await loadThreads(id);
  for(const nextMsg of replies.slice(1)){
    const delayMs=Math.min(1400,Math.max(550,(nextMsg.text||'').length*38));
    await new Promise(res=>setTimeout(res,delayMs));
    state.hiddenReplyIds.delete(nextMsg.id);
    if(state.activeId===profileId&&state.threadId===id&&state.tab==='messages')renderMessages();
  }
  state.revealingBubbles=false;
  state.hiddenReplyIds.clear();
  if(state.activeId===profileId&&state.threadId===id&&state.tab==='messages')renderMessages();
  else refreshInboxQuietly(profileId);
}
async function flushChat(force=false){if(state.flushBusy||state.chatBusy||state.revealingBubbles||!state.threadId||state.chatMode!=='chat')return;
  state.flushBusy=true;const id=state.threadId,profileId=state.activeId;
  if(state.tab==='messages'&&state.threadId===id)renderMessages();
  try{
    const r=await api('/chat-flush',{profileId,characterId:id,force});
    if(r.warning)toast(r.warning);
    state.flushBusy=false;
    if(r.replies&&r.replies.length>1){
      await revealMultipleBubbles(r.replies,profileId,id);
    }else if(state.activeId===profileId&&state.threadId===id&&state.tab==='messages'){
      await loadThreads(id);
    }else if(state.activeId===profileId){await refreshInboxSnapshot(profileId);}
  }catch(e){state.flushBusy=false;toast('发送失败：'+e.message);if(state.tab==='messages'&&state.threadId===id)renderMessages()}
}
async function flushBackgroundQueues(){
  if(state.flushBusy||state.chatBusy||state.revealingBubbles||!state.activeId)return;
  state.flushBusy=true;const profileId=state.activeId;
  try{
    const r=await api('/chat-flush-due',{profileId});
    const list=r?.flushed||[];
    for(const item of list){
      if(item.warning)toast(`${item.characterName} 回复失败：${item.warning}`);
      else if(item.reply)toast(`收到来自 ${item.characterName} 的新消息`);
    }
    if(list.length&&state.activeId===profileId){
      if(state.tab==='messages')await loadThreads(state.threadId);
      else await refreshInboxSnapshot(profileId);
    }
  }catch{}finally{state.flushBusy=false}
}
async function checkProactiveMessages(trigger='startup',targetCharId=''){
  if(state.proactiveBusy||state.flushBusy||state.chatBusy||state.revealingBubbles||!state.activeId)return;
  if(state.settings.mode==='normal')return;
  if(trigger!=='manual'&&state.settings.proactive_mode==='off')return;
  state.proactiveBusy=true;
  const profileId=state.activeId;
  const showTypingOnCurrent=Boolean(targetCharId&&state.tab==='messages'&&state.threadId===targetCharId);
  if(showTypingOnCurrent){
    state.flushBusy=true;
    renderMessages();
  }
  try{
    const r=await api('/proactive-check',{profileId,trigger,characterId:targetCharId});
    const list=r?.delivered||[];
    if(showTypingOnCurrent)state.flushBusy=false;
    for(const item of list){
      toast(`收到来自 ${item.characterName} 的主动消息`);
      if(state.activeId===profileId&&state.tab==='messages'){
        if(state.threadId===item.characterId&&item.replies?.length>1){
          await revealMultipleBubbles(item.replies,profileId,item.characterId);
        }else{
          await loadThreads(state.threadId);
        }
      }
    }
    if(list.length&&state.activeId===profileId&&state.tab!=='messages')await refreshInboxSnapshot(profileId);
    if(!list.length&&trigger==='manual'){
      toast('当前还没有已匹配的角色，先去「发现」右滑匹配一位角色吧');
    }
  }catch(e){
    if(showTypingOnCurrent)state.flushBusy=false;
    if(trigger==='manual')toast('主动消息触发失败：'+e.message);
  }finally{
    state.proactiveBusy=false;
    if(showTypingOnCurrent&&state.tab==='messages')renderMessages();
  }
}
async function tickChatQueue(){
  if(!state.activeId)return;
  const curDate=localDateStr();
  if(state.lastKnownDate&&curDate!==state.lastKnownDate){
    state.lastKnownDate=curDate;
    if(state.threadId){
      api('/diary',{profileId:state.activeId,characterId:state.threadId}).then(d=>{
        if(d){
          state.diaryMap[state.threadId]=d;
          state.diarySummaryMap[state.threadId]={latestDate:d.latestDate,availableDates:d.availableDates,latestTitle:d.diary?.title||''};
        }
        toast('已过零点 · 已根据前日监控自动生成角色最新日记');
      }).catch(()=>{});
    }
  }
  if(state.tab==='messages'&&state.threadId&&state.chatMode==='chat'){
    updateQueueCountdown();
    const q=state.queue;
    if(q?.count>0&&!q.blocked&&q.status!=='inflight'&&!state.chatBusy&&!state.flushBusy&&!state.revealingBubbles){
      const now=Date.now();
      const isHot=Boolean(state.hotChat||q.paceMode==='hot');
      const effectiveDue=isHot?Math.max(Number(q.dueAt||0),(state.lastSendAt||0)+60000):Number(q.dueAt||0);
      if(effectiveDue>0&&now>=effectiveDue){
        await flushChat(true);
        return;
      }
    }
  }
  state.bgTickCount=(state.bgTickCount+1)%3;
  if(state.bgTickCount===0&&!state.chatBusy&&!state.flushBusy&&!state.revealingBubbles){
    await flushBackgroundQueues();
  }
  state.idleTickCount=(state.idleTickCount+1)%15;
  if(state.idleTickCount===0&&state.settings.proactive_mode!=='off'&&state.settings.mode!=='normal'){
    const idleMs=Date.now()-(state.lastUserActiveAt||Date.now());
    if(idleMs>=180000&&!state.chatBusy&&!state.flushBusy&&!state.revealingBubbles&&!state.proactiveBusy){
      state.lastUserActiveAt=Date.now();
      await checkProactiveMessages('idle',state.tab==='messages'?state.threadId:'');
    }
  }
}
setInterval(tickChatQueue,1000);
async function toggleHotChat(){
  if(!state.threadId||!state.activeId||state.chatBusy)return;
  const nextHot=!state.hotChat;
  try{
    const r=await api('/hot-chat',{profileId:state.activeId,characterId:state.threadId,hotChat:nextHot});
    state.hotChat=Boolean(r.hotChat);
    if(r.queue)state.queue=r.queue;
    if(state.hotChat)state.lastSendAt=Date.now();
    renderMessages();
    toast(state.hotChat?'已开启热聊模式':'已切回日常模式');
  }catch(e){toast(e.message)}
}
async function sendMessage(e){e.preventDefault();if(state.chatBusy)return;
  const input=$('chat-input'),txt=input?.value.trim();if(!txt)return;
  state.chatBusy=true;const id=state.threadId,mode=state.chatMode,profileId=state.activeId;
  input.value='';state.draftInputs[id]='';state.lastSendAt=Date.now();
  const now=new Date().toISOString();state.messages.push({id:'pending',sender:'user',mode,text:txt,created_at:now,engine:'human'});
  if(mode==='meeting')state.messages.push({id:'typing',sender:'ai',mode,text:'…',created_at:now,engine:'human'});
  renderMessages();
  try{const r=await api('/message',{profileId,characterId:id,text:txt});if(r.warning)toast(r.warning);if(state.activeId===profileId&&state.threadId===id&&state.tab==='messages')await loadThreads(id);else refreshInboxQuietly(profileId)}
  catch(e){toast(e.message);if(state.activeId===profileId&&state.threadId===id)await loadThreads(id)}
  finally{state.chatBusy=false;if(state.tab==='messages'&&state.threadId===id){renderMessages();const el=$('chat-input');if(el)el.focus()}}
}
async function continueReply(){if(state.chatBusy||state.flushBusy||state.queue?.status==='inflight'||!state.threadId)return;
  if(state.chatMode==='chat'&&state.queue?.count){return flushChat(true)}
  state.chatBusy=true;const id=state.threadId,profileId=state.activeId,mode=state.chatMode;state.messages.push({id:'typing',sender:'ai',mode,text:'…',created_at:new Date().toISOString(),engine:'human'});renderMessages();
  try{const r=await api('/reply',{profileId,characterId:id});if(r.warning)toast(r.warning);if(r.replies&&r.replies.length>1){state.chatBusy=false;await revealMultipleBubbles(r.replies,profileId,id);return}if(state.activeId===profileId&&state.threadId===id&&state.tab==='messages')await loadThreads(id);else refreshInboxQuietly(profileId)}catch(e){toast(e.message);if(state.activeId===profileId&&state.threadId===id)await loadThreads(id)}finally{state.chatBusy=false;if(state.tab==='messages'&&state.activeId===profileId&&state.threadId===id)renderMessages()}
}
async function deleteMessage(mid){
  if(!mid||!state.threadId||state.chatBusy)return;
  const id=state.threadId,profileId=state.activeId;
  try{
    await api('/message-delete',{profileId,characterId:id,messageId:mid});
    if(state.activeId===profileId&&state.threadId===id)await loadThreads(id);
    toast('已撤回一条消息');
  }catch(e){toast(e.message)}
}
async function changeMode(){
  if(!state.threadId||state.chatBusy||state.flushBusy)return;
  const id=state.threadId,profileId=state.activeId;
  const next=state.chatMode==='chat'?'meeting':'chat';
  if(next==='meeting'){
    const input=$('chat-input');
    const draftTxt=input?.value?.trim()||'';
    try{
      if(draftTxt){
        input.value='';
        state.draftInputs[id]='';
        state.messages.push({id:'pending',sender:'user',mode:'chat',text:draftTxt,created_at:new Date().toISOString(),engine:'human'});
        renderMessages();
        await api('/message',{profileId,characterId:id,text:draftTxt});
      }
      state.flushBusy=true;
      renderMessages();
      const r=await api('/mode',{profileId,characterId:id,mode:'meeting',triggerOpening:true});
      if(r.warning)toast(r.warning);
      state.flushBusy=false;
      await loadThreads(id);
      toast('已进入面对面文字小说页面');
    }catch(e){
      state.flushBusy=false;
      renderMessages();
      toast(e.message);
    }
    return;
  }
  const loc=$('meeting-location-input')?.value?.trim()||state.meetingLocation||'';
  state.chatBusy=true;
  try{
    await api('/mode',{profileId,characterId:id,mode:'chat',finalizeMeeting:true,location:loc});
    state.chatBusy=false;
    await loadThreads(id);
    toast('已结束见面：聊天页已生成本次见面卡片，点击卡片可查看完整记录');
  }catch(e){
    state.chatBusy=false;
    toast(e.message);
  }
}
function confirmUnmatch(){const t=state.threads.find(x=>x.character.id===state.threadId);if(!t)return;modal(`<h2>要解除与 ${esc(t.character.name)} 的匹配吗？</h2><p>这会把对方从消息列表移除，但不会删除你们的聊天记录或角色的记忆。以后再次匹配时还会认得你。</p>`,`<button class="btn soft" data-action="close-modal">取消</button><button class="btn danger" data-action="confirm-unmatch">解除匹配</button>`)}
// Terminal
async function loadTerminal(){const [a,b,c]=await Promise.all([api('/settings'),api('/presets'),api('/system-logs').catch(()=>({logs:[]}))]);state.settings=a;state.presets=b.entries||[];state.presetDiagnostics=b.diagnostics||{};state.systemLogs=c?.logs||[];state.logEnabled=c?.enabled!==false;state.logStorage=c?.storage||'session';renderChrome();renderTerminal()}
function renderTerminal(){$('topbar-actions').innerHTML=`<span class="status-pill ${state.settings.mode==='live'?'live':''}">${state.settings.mode==='live'?'LIVE API':(state.settings.mode==='normal'?'NORMAL · 未连接 API':'DEMO MODE')}</span>`;const tabBody=state.terminalTab==='api'?renderApiSettings():(state.terminalTab==='presets'?renderPresets():renderSystemLogs());$('view').innerHTML=`<div class="terminal-screen"><div class="terminal-tabs"><button class="terminal-tab ${state.terminalTab==='api'?'active':''}" data-action="term-tab" data-tab="api">${I('link')} 连接与模型</button><button class="terminal-tab ${state.terminalTab==='presets'?'active':''}" data-action="term-tab" data-tab="presets">${I('book')} 文字预设</button><button class="terminal-tab ${state.terminalTab==='logs'?'active':''}" data-action="term-tab" data-tab="logs">${I('monitor')} 生成日志${state.systemLogs.length?` (${state.systemLogs.length})`:''}</button></div>${tabBody}${globalThis.ParallelOffline&&state.terminalTab==='api'?renderPortableBackup():''}</div>`;if(state.terminalTab==='api'){const form=$('api-settings-form');form.addEventListener('submit',saveSettings);$('api-temperature').addEventListener('input',e=>$('temp-output').textContent=e.target.value);$('api-top-p').addEventListener('input',e=>$('topp-output').textContent=e.target.value)} }
function renderPortableBackup(){return `<div class="terminal-card"><div class="kicker">LOCAL DATA</div><h3>存档备份</h3><p class="caption">单 HTML 版把聊天和 Profile 存在当前浏览器中。移动文件或清理浏览器数据可能导致存档丢失。建议定期导出备份。导出的 JSON 不包含 API Key 與生成日志。</p>${globalThis.ParallelOffline.storageAvailable?'':`<div class="notice" style="margin:12px 0">当前浏览器禁止本地持久化，刷新页面后存档可能消失。请在结束前导出备份。</div>`}<div class="inline-row" style="margin-top:14px"><button type="button" class="btn soft" data-action="export-backup">${I('book')} 导出存档 JSON</button><label class="btn soft file-upload">${I('refresh')} 恢复存档<input type="file" id="portable-restore" accept=".json,application/json"></label></div></div>`}
function exportBackup(){const raw=globalThis.ParallelOffline.exportData(),blob=new Blob([raw],{type:'application/json'}),href=URL.createObjectURL(blob),a=document.createElement('a');a.href=href;a.download='Parallel_Backup_'+new Date().toISOString().slice(0,10)+'.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(href),2000);toast('存档已导出（不包含 API Key）')}
let pendingRestoreText='';
async function importBackup(file){if(!file)return;try{pendingRestoreText=await file.text();modal(`<h2>恢复存档确认</h2><p>这将用备份文件 <b>${esc(file.name)}</b> 覆盖当前存档。确定继续吗？</p>`,`<button class="btn ghost" data-action="close-modal">取消</button><button class="btn primary" data-action="confirm-restore-backup">确认恢复</button>`)}catch(e){toast('读取备份失败：'+e.message)}}
async function confirmRestoreBackup(){if(!pendingRestoreText)return;try{const r=globalThis.ParallelOffline.importData(pendingRestoreText);pendingRestoreText='';closeModal();state.activeId='';state.profileDraft=null;state.threadId='';state.renderedThreadId='';state.draftInputs={};state.candidates=[];state.threads=[];state.messages=[];await bootstrap();toast(`已恢复 ${r.profiles} 个 Profile、${r.messages} 条消息，请重新填写 API Key`)}catch(e){toast('恢复失败：'+e.message)}}
function renderApiSettings(){const s=state.settings;const pmOff=(s.proactive_mode==='off');return `<form id="api-settings-form"><div class="terminal-card"><div class="kicker">CONNECTION</div><h3>连接到你的模型</h3><p class="caption">${globalThis.ParallelOffline?'单文件 HTML 版直接从浏览器调用 OpenAI-compatible API（需要供应商允许 CORS）。':'使用 OpenAI-compatible 接口。通过本机服务调用模型。'}</p><div class="field"><label>API Base URL</label><input id="api-url" autocomplete="off" type="url" placeholder="https://your-provider.example/v1" value="${esc(s.base_url||'')}"></div><div class="field"><label>API Key</label><input id="api-key" type="password" autocomplete="new-password" placeholder="${s.has_key?'已保存密钥（留空不更改）':'sk-...'}"><span class="field-hint">${globalThis.ParallelOffline?'密钥在当前浏览器存储中以明文保存，避免在共享设备使用；如需更安全的 API 代理，请使用服务器版。':'密钥只在本机服务端 data/connection.json 中保存（权限 0600），不要分享 data 文件夹。'}</span></div><div class="inline-row" style="margin-top:14px"><button type="button" class="btn soft" data-action="clear-key">${I('trash')} 删除已存密钥</button>${s.has_key?'<span class="pill">密钥已保存</span>':''}</div><div class="divider"></div><div class="field"><label>聊天模型 ID</label><div class="inline-row" style="align-items:stretch"><input id="api-model" list="model-list" placeholder="点击拉取，或直接填写模型名" value="${esc(s.model||'')}" style="flex:1;min-width:130px"><datalist id="model-list"></datalist><button type="button" class="btn soft" data-action="fetch-models">${I('refresh')} 拉取</button></div></div></div><div class="terminal-card"><div class="kicker">PROACTIVE MESSAGES · 角色主动消息</div><h3>角色主动消息开关</h3><p class="caption">控制是否允许已匹配的角色主动给你发消息。</p><div class="field"><label for="api-proactive-mode">主动消息状态</label><select id="api-proactive-mode"><option value="daily" ${!pmOff?'selected':''}>开启</option><option value="off" ${pmOff?'selected':''}>关闭</option></select></div></div><div class="terminal-card"><div class="kicker">SAMPLING</div><h3>生成参数</h3><p class="caption">按模型能力调整；不是每家供应商都支持所有参数。</p><div class="range-line"><span>Temperature</span><b id="temp-output">${s.temperature??.85}</b></div><input class="range" id="api-temperature" type="range" min="0" max="2" step="0.05" value="${s.temperature??.85}"><div class="range-line" style="margin-top:19px"><span>Top P</span><b id="topp-output">${s.top_p??1}</b></div><input class="range" id="api-top-p" type="range" min="0.05" max="1" step="0.05" value="${s.top_p??1}"><div class="field" style="margin-top:18px"><label>Max tokens</label><span class="field-hint">控制单次生成的最大输出 Token 预算（支持 100–32768）。长篇面对面小说预设或带思考链（Reasoning）的模型建议设为 4096–8192，避免输出预算被思考过程耗尽。</span><input id="api-max-tokens" type="number" min="100" max="32768" value="${s.max_tokens||4096}"></div></div><div class="terminal-card"><div class="kicker">PHOTO &amp; IMAGE AI</div><h3>角色照片呈现与图片生成 AI</h3><p class="caption">如果填写了下方图片生成 AI 的 API 链接、密钥与模型，发现页将调用该接口生成角色照片；如果留空未填写，则保持文字描写显示。</p><div class="field"><label>图片生成 API Base URL（选填）</label><input id="api-image-url" autocomplete="off" type="url" placeholder="https://your-image-provider.example/v1（留空则用文字呈现照片）" value="${esc(s.image_base_url||'')}"></div><div class="field"><label>图片生成 API Key（选填）</label><input id="api-image-key" type="password" autocomplete="new-password" placeholder="${s.has_image_key?'已保存图片密钥（留空不更改）':'sk-...（留空则用文字呈现照片）'}"><span class="field-hint">支持兼容 OpenAI <code>/images/generations</code> 接口的生图服务。不填则自动使用文字描写。</span></div><div class="inline-row" style="margin-top:14px"><button type="button" class="btn soft" data-action="clear-image-key">${I('trash')} 删除图片密钥</button><span class="pill">${s.image_mode==='live'?'已启用图片生成 AI':(s.has_image_key?'图片密钥已保存':'当前：文字照片呈现')}</span></div><div class="divider"></div><div class="field"><label>图片生成模型 ID（选填）</label><div class="inline-row" style="align-items:stretch"><input id="api-image-model" list="image-model-list" placeholder="点击拉取，或直接填写生图模型名（如 dall-e-3 / gpt-image-1）" value="${esc(s.image_model||'')}" style="flex:1;min-width:130px"><datalist id="image-model-list"></datalist><button type="button" class="btn soft" data-action="fetch-image-models">${I('refresh')} 拉取</button></div></div></div><button type="submit" class="btn primary" style="width:100%;padding:15px">${I('check')} 保存终端配置</button><div class="notice" style="margin-top:14px">演示模式使用已收录的角色目录、确定性的示例匹配和明显标注的演示回复。只有连接模型后才会调用真实 LLM 或生图接口。首次调用可能产生费用。${globalThis.ParallelOffline?'模型供应商需允许网页跨域请求（CORS），否则请运行 Python 服务版。':'模型调用由本机服务端发起。'}</div></form>`}
async function saveSettings(e){e.preventDefault();try{const data={base_url:$('api-url').value.trim(),model:$('api-model').value.trim(),proactive_mode:$('api-proactive-mode')?.value||'daily',image_base_url:$('api-image-url').value.trim(),image_model:$('api-image-model').value.trim(),temperature:Number($('api-temperature').value),top_p:Number($('api-top-p').value),max_tokens:Number($('api-max-tokens').value)};if($('api-key').value)data.api_key=$('api-key').value;if($('api-image-key').value)data.image_api_key=$('api-image-key').value;const res=await api('/settings',data);state.settings=res.settings;state.portraitFailed={};renderChrome();renderTerminal();toast('终端配置已保存')}catch(e){toast(e.message)}}
async function fetchModels(){try{const s=$('api-url')?.value.trim(),m=$('api-model')?.value.trim(),k=$('api-key')?.value;if(s!==state.settings.base_url || k){toast('请先保存 API 地址和密钥，再拉取模型');return}const r=await api('/models');$('model-list').innerHTML=r.models.map(x=>`<option value="${esc(x)}"></option>`).join('');if(!m && r.models[0])$('api-model').value=r.models[0];toast(`找到 ${r.models.length} 个模型，已加入输入框候选`)}catch(e){toast(e.message)}}
async function fetchImageModels(){try{const s=$('api-image-url')?.value.trim(),m=$('api-image-model')?.value.trim(),k=$('api-image-key')?.value;if(s!==(state.settings.image_base_url||'') || k){toast('请先保存图片 API 地址和密钥，再拉取模型');return}const r=await api('/image-models');$('image-model-list').innerHTML=r.models.map(x=>`<option value="${esc(x)}"></option>`).join('');if(!m && r.models[0])$('api-image-model').value=r.models[0];toast(`找到 ${r.models.length} 个图片模型，已加入输入框候选`)}catch(e){toast(e.message)}}
function renderPresetDiagnosticsBox(mode,items){
  const diag=state.presetDiagnostics?.[mode]||(globalThis.ParallelOffline?.diagnosePresets?globalThis.ParallelOffline.diagnosePresets(mode):null);
  if(!diag)return '';
  const rb=diag.rolesBreakdown||{system:0,user:0,assistant:0};
  const warnList=Array.isArray(diag.warnings)?diag.warnings:[];
  return `<div class="preset-diag-card" id="preset-diag-box">
    <div class="preset-diag-head">
      <div>
        <div class="kicker">PRESET DIAGNOSTICS · 预设编译与冲突诊断</div>
        <h4>${mode==='meeting'?'面对面小说模式':'手机聊天模式'} · 已启用 ${diag.enabledCount}/${diag.totalCount} 条（共 ${diag.totalEnabledChars} 字符）</h4>
      </div>
      <span class="preset-badge ${diag.enabledCount>0?'ok':'warn'}">${diag.enabledCount>0?'编译就绪':'无启用条目'}</span>
    </div>
    <div class="preset-diag-chips">
      <span class="preset-chip">System: ${rb.system||0}</span>
      <span class="preset-chip">User: ${rb.user||0}</span>
      <span class="preset-chip">Assistant: ${rb.assistant||0}</span>
      ${mode==='meeting'?`<span class="preset-chip ${diag.hasCotCheck?'active':''}">COT 连续性自检: ${diag.hasCotCheck?'已启用':'未启用'}</span>`:''}
      ${mode==='meeting'?`<span class="preset-chip ${diag.hasBottomPledge?'active':''}">Assistant 底部誓约: ${diag.hasBottomPledge?'已后置生效':'未启用'}</span>`:''}
      ${mode==='meeting'&&diag.styleGroupTotal>0?`<span class="preset-chip ${diag.enabledStyleCount===1?'active':'warn'}">文风（单选）: ${diag.enabledStyleCount===1?esc(diag.enabledStyleNames[0]):(diag.enabledStyleCount===0?'未选':'多选('+diag.enabledStyleCount+')')}</span>`:''}
    </div>
    ${warnList.length?`<div class="preset-diag-warnings">${warnList.map(w=>`<div class="preset-diag-warn"><span>${esc(w.message)}</span></div>`).join('')}
      <div class="inline-row" style="margin-top:8px">
        ${diag.defaultAndCustomCoexist?`<button type="button" class="btn soft" data-action="preset-disable-defaults">停用默认保底条目（仅保留导入预设）</button>`:''}
        ${diag.duplicateCount>0?`<button type="button" class="btn soft" data-action="preset-deduplicate">清理重复条目（移除 ${diag.duplicateCount} 条重复项）</button>`:''}
      </div>
    </div>`:`<p class="caption" style="margin-top:6px">当前模式预设结构正常，未检测到默认条目冲突、重复导入或文风单选冲突。</p>`}
  </div>`;
}
function renderPresets(){
  const items=state.presets.filter(x=>x.mode===state.presetMode).sort((a,b)=>a.sort_order-b.sort_order);
  return `<div class="terminal-card"><div class="kicker">TEXT PRESETS</div><h3>Prompt 条目管理</h3><p class="caption">聊天气泡和线下小说使用独立的条目与顺序。这里的编辑会直接影响每次真实模型请求。</p><div class="terminal-tabs"><button class="terminal-tab ${state.presetMode==='chat'?'active':''}" data-action="preset-mode" data-mode="chat">手机聊天</button><button class="terminal-tab ${state.presetMode==='meeting'?'active':''}" data-action="preset-mode" data-mode="meeting">面对面小说</button></div>${renderPresetDiagnosticsBox(state.presetMode,items)}<div class="preset-toolbar"><span class="caption">${items.length} 个 Prompt 条目 · ${items.filter(x=>x.enabled).length} 个启用 · ${items.filter(x=>!x.enabled).length} 个禁用</span><button class="btn soft" data-action="add-preset">${I('plus')} 添加条目</button></div><div class="inline-row" style="margin:14px 0 8px"><button class="btn soft" data-action="export-preset" data-scope="current">${I('book')} 导出当前模式</button><button class="btn soft" data-action="export-preset" data-scope="all">${I('book')} 导出全部</button><label class="btn soft file-upload">${I('plus')} 导入 JSON<input id="preset-import-file" type="file" accept=".json,application/json"></label></div><p class="caption">支持 Parallel 自有 JSON 与 Elsewhere 自有预设 JSON（后者导入面对面小说模式，完整保留原条目分组、角色、启停状态及排序）。</p><div class="preset-list">${items.map((p,i)=>`<div class="preset-row ${p.enabled?'is-enabled':'is-disabled'}"><div class="preset-order"><button class="icon-btn" data-action="move-preset" data-id="${esc(p.id)}" data-dir="-1" ${i===0?'disabled':''}>${I('up')}</button><button class="icon-btn" data-action="move-preset" data-id="${esc(p.id)}" data-dir="1" ${i===items.length-1?'disabled':''}>${I('down')}</button></div><div class="preset-text"><div class="preset-title-line"><strong>#${i+1} ${esc(p.name)}</strong><span class="preset-role-tag role-${esc(p.role)}">${esc(p.role)}</span>${p.group?`<span class="preset-group-tag">${esc(p.group)}</span>`:''}<span class="preset-state-tag ${p.enabled?'on':'off'}">${p.enabled?'启用中':'已禁用'}</span></div><small>${p.content.length} 字符 · ${esc(p.content.replace(/\s+/g,' ').slice(0,72))}${p.content.length>72?'…':''}</small></div><button class="icon-btn" title="编辑" data-action="edit-preset" data-id="${esc(p.id)}">${I('edit')}</button><button class="toggle ${p.enabled?'on':''}" title="启停" data-action="toggle-preset" data-id="${esc(p.id)}"></button></div>`).join('')}</div></div><div class="terminal-card"><h3>预设与职责边界说明</h3><p class="caption">Parallel 负责提供角色原作身份、玩家 Profile、关系记忆、实时地点与历史上下文；文字预设负责控制小说文风、叙事视角、篇幅区间、去油腻规范、COT 连续性自检与底部誓约确认。更换或启停预设条目后将在下一次生成立即生效。</p></div>`;
}
function renderSystemLogs(){
  const filter=state.logFilterMode||'all';
  const allLogs=Array.isArray(state.systemLogs)?state.systemLogs:[];
  const logs=filter==='all'?allLogs:allLogs.filter(x=>x.mode===filter);
  return `<div class="terminal-card">
    <div class="kicker">GENERATION LOGS · 终端生成诊断日志</div>
    <div class="preset-diag-head" style="margin-bottom:8px">
      <div>
        <h3>模型调用与预设注入日志</h3>
        <p class="caption">记录实际请求与模型回复，仅用于本地调试，不参与角色记忆。日志与正式存档隔离，最多40条且不超过4 MiB。${state.logStorage==='indexeddb'?'独立 IndexedDB 存储。':'当前为会话内存存储，刷新或重启后可能清空。'}</p>
      </div>
      <div class="inline-row">
        <button type="button" class="btn ${state.logEnabled===false?'soft':'primary'}" data-action="toggle-system-logs">${state.logEnabled===false?'开启调试记录':'关闭调试记录'}</button>
        <button type="button" class="btn soft" data-action="refresh-system-logs">${I('refresh')} 刷新</button>
        <button type="button" class="btn danger" data-action="clear-system-logs" ${allLogs.length?'':'disabled'}>${I('trash')} 清空日志</button>
      </div>
    </div>
    <div class="terminal-tabs" style="margin-bottom:14px">
      <button class="terminal-tab ${filter==='all'?'active':''}" data-action="filter-system-logs" data-mode="all">全部 (${allLogs.length})</button>
      <button class="terminal-tab ${filter==='meeting'?'active':''}" data-action="filter-system-logs" data-mode="meeting">面对面小说 (${allLogs.filter(x=>x.mode==='meeting').length})</button>
      <button class="terminal-tab ${filter==='chat'?'active':''}" data-action="filter-system-logs" data-mode="chat">手机聊天 (${allLogs.filter(x=>x.mode==='chat').length})</button>
    </div>
    ${logs.length===0?`<div class="notice">暂无生成日志。当你在「消息」或「面对面小说」中触发模型回复后，这里会记录完整的请求 Payload、生效预设与模型原始响应。</div>`:`<div class="syslog-list">${logs.map((log,idx)=>{
      const isErr=Boolean(log.error);
      const isTrunc=Boolean(log.truncation_warning)||log.finish_reason==='length'||log.finish_reason==='max_tokens';
      const u=log.usage||{};
      const smp=log.sampling||{};
      const actList=Array.isArray(log.active_presets)?log.active_presets:[];
      const disList=Array.isArray(log.disabled_presets)?log.disabled_presets:[];
      const modeLabel=log.mode==='meeting'?'面对面小说':(log.mode==='chat'?'手机聊天':(log.mode||'系统'));
      return `<div class="syslog-card ${isErr?'is-error':(isTrunc?'is-warn':'')}" id="syslog-${esc(log.id)}">
        <div class="syslog-head">
          <div class="syslog-title">
            <span class="preset-badge ${log.mode==='meeting'?'ok':''}">${esc(modeLabel)}</span>
            <strong>${esc(log.entry_point||log.mode||'request')}</strong>
            <span>${esc(log.profile_name||'—')} ↔ ${esc(log.character_name||'—')}</span>
            <small>${esc(String(log.created_at||'').replace('T',' ').slice(0,19))}</small>
          </div>
          <div class="inline-row">
            <span class="preset-badge ${isErr?'danger':(isTrunc?'warn':'ok')}">${isErr?'请求失败':(isTrunc?'截断 (finish='+esc(log.finish_reason)+')':'finish='+esc(log.finish_reason||'stop'))}</span>
            <button type="button" class="btn soft" style="padding:5px 9px;font-size:11px" data-action="copy-system-log" data-id="${esc(log.id)}">复制 JSON</button>
            <button type="button" class="icon-btn" title="删除此条日志" data-action="delete-system-log" data-id="${esc(log.id)}">${I('trash')}</button>
          </div>
        </div>
        ${log.storage_warning?`<div class="preset-diag-warn">${esc(log.storage_warning)}</div>`:''}
        ${log.truncation_warning?`<div class="preset-diag-warn" style="margin:8px 0"><span>${esc(log.truncation_warning)}</span></div>`:''}
        ${log.error?`<div class="preset-diag-warn" style="margin:8px 0"><span>错误信息：${esc(log.error)}</span></div>`:''}
        <div class="syslog-meta-grid">
          <div><small>模型 ID</small><b>${esc(log.model||'—')}</b></div>
          <div><small>采样参数</small><b>T=${smp.temperature??'—'} · P=${smp.top_p??'—'} · Max=${smp.max_tokens??'—'}</b></div>
          <div><small>生效预设</small><b>${log.active_preset_count??actList.length} 启用 / ${log.disabled_preset_count??disList.length} 禁用</b></div>
          <div><small>正文字数</small><b>原始 ${log.char_count_raw??0} 字 → 展示 ${log.char_count_parsed??0} 字</b></div>
          <div><small>Token 消耗</small><b>输入 ${u.prompt_tokens??'—'} · 输出 ${u.completion_tokens??'—'}${u.reasoning_tokens?` (思考 ${u.reasoning_tokens})`:''} · 总计 ${u.total_tokens??'—'}</b></div>
          <div><small>耗时与鉴权</small><b>${log.duration_ms??0} ms · ${esc(log.headers_masked?.Authorization||'Bearer ***')}</b></div>
        </div>
        <details class="syslog-details">
          <summary>查看生效预设条目 (${actList.length} 条启用 / ${disList.length} 条禁用)</summary>
          <div class="syslog-preset-box">
            <p class="caption" style="margin:0 0 6px"><b>已启用并注入本次请求的条目（按实际编译顺序）：</b></p>
            <div class="syslog-preset-tags">${actList.map((ap,i)=>`<span class="preset-chip active">#${i+1} [${esc(ap.role)}] ${esc(ap.name)} (${ap.chars}字)</span>`).join('')||'<span>无</span>'}</div>
            ${disList.length?`<p class="caption" style="margin:10px 0 6px"><b>已禁用且未参与本次生成的条目：</b></p><div class="syslog-preset-tags">${disList.map(dp=>`<span class="preset-chip">[${esc(dp.role)}] ${esc(dp.name)} (已禁用)</span>`).join('')}</div>`:''}
          </div>
        </details>
        <details class="syslog-details" ${idx===0?'open':''}>
          <summary>查看模型原始输出 vs 解析后展示文本 (${log.char_count_raw??0} 字 → ${log.char_count_parsed??0} 字)</summary>
          <div class="syslog-compare-grid">
            <div>
              <div class="caption"><b>模型原始返回文本 (Raw Content)</b></div>
              ${log.reasoning_content?`<pre class="syslog-pre" style="margin-bottom:6px;background:#F5EFE6">[思考链 Reasoning Content · ${log.reasoning_content.length} 字]\n${esc(log.reasoning_content)}</pre>`:''}
              <pre class="syslog-pre">${esc(log.raw_content||'（空）')}</pre>
            </div>
            <div>
              <div class="caption"><b>解析清洗后最终展示文本 (Parsed Content)</b></div>
              <pre class="syslog-pre">${esc(log.parsed_content||'（空）')}</pre>
            </div>
          </div>
        </details>
        <details class="syslog-details">
          <summary>查看实际发送的完整 Request Payload (${log.request_payload?.messages?.length||0} 条 messages)</summary>
          <pre class="syslog-pre">${esc(JSON.stringify(log.request_payload||{},null,2))}</pre>
        </details>
        <details class="syslog-details">
          <summary>查看模型原始返回 Raw Response JSON</summary>
          <pre class="syslog-pre">${esc(JSON.stringify(log.raw_response||{},null,2))}</pre>
        </details>
      </div>`;
    }).join('')}</div>`}
  </div>`;
}
async function refreshSystemLogs(){
  const d=await api('/system-logs').catch(()=>({logs:[]}));
  state.systemLogs=d.logs||[];state.logEnabled=d.enabled!==false;state.logStorage=d.storage||'session';
  if(state.tab==='terminal')renderTerminal();
}
function makePresetPackage(scope){
  const modes=scope==='current'?[state.presetMode]:['chat','meeting'];
  const entries=state.presets.filter(p=>modes.includes(p.mode)).sort((a,b)=>modes.indexOf(a.mode)-modes.indexOf(b.mode)||a.sort_order-b.sort_order).map(p=>({mode:p.mode,name:p.name,role:p.role,enabled:!!p.enabled,content:p.content,sort_order:p.sort_order,...(p.group?{group:p.group}:{})}));
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
      const enCnt=pack.entries.filter(x=>x.enabled===true).length;
      const disCnt=pack.entries.length-enCnt;
      desc=`Elsewhere 自有预设 · 共 ${pack.entries.length} 个条目（${enCnt} 个启用、${disCnt} 个禁用）→ 导入至面对面小说模式`;
    }else if(pack?.format==='parallel-text-preset'&&pack.schemaVersion===1&&Array.isArray(pack.entries)&&Array.isArray(pack.modes)&&pack.entries.length>0&&pack.entries.length<=200){
      desc=pack.modes.map(m=>(m==='chat'?'手机聊天':'面对面小说')+' '+pack.entries.filter(x=>x.mode===m).length+' 条').join('、');
    }else throw Error('仅支持 Parallel 或 Elsewhere 自有预设 JSON');
    state.presetImportDraft=pack;
    modal(`<h2>导入文字预设</h2><p>文件：${esc(file.name)}</p><p>包含：${esc(desc)}</p><div class="notice"><b>推荐使用「替换涉及模式」</b>：将完整替换为新预设的 ${pack.entries.length} 个条目，避免与系统默认保底条目叠加冲突。<br>「追加导入」会保留当前已有条目并在末尾追加。不会修改原始 JSON 文件，也不会影响聊天或 API 设置。</div>`,`<button class="btn ghost" data-action="close-modal">取消</button><button class="btn soft" data-action="apply-preset-import" data-how="append">追加导入</button><button class="btn primary" data-action="apply-preset-import" data-how="replace">替换涉及模式（推荐）</button>`);
  }catch(e){state.presetImportDraft=null;toast('导入文件无效：'+e.message)}
}
async function applyPresetImport(how){
  const pack=state.presetImportDraft;if(!pack)throw Error('请重新选择预设文件');
  const isElsewhere=pack.format==='elsewhere-preset';
  const result=await api('/preset-import',{import_mode:how,preset:pack});state.presetImportDraft=null;if(isElsewhere)state.presetMode='meeting';closeModal();await refreshPresets();toast(`成功导入 ${result.imported} 个 Prompt 条目（${how==='replace'?'已替换目标模式':'已追加'}）`);
}
async function refreshPresets(){const d=await api('/presets');state.presets=d.entries||[];state.presetDiagnostics=d.diagnostics||{};renderTerminal()}
function editPresetModal(p){const item=p||{id:'',name:'新 Prompt 条目',role:'system',enabled:true,content:'',mode:state.presetMode};const html=`<h2>${p?'编辑 Prompt':'新增 Prompt'}</h2><p>仅适用于「${item.mode==='chat'?'手机聊天':'面对面小说'}」模式。</p><form id="preset-edit-form"><div class="field"><label>条目名称</label><input id="pe-name" maxlength="100" value="${esc(item.name)}" required></div><div class="field"><label>Role</label><select id="pe-role">${['system','user','assistant'].map(r=>`<option ${item.role===r?'selected':''}>${r}</option>`).join('')}</select></div><div class="field"><label>Prompt 内容</label><textarea id="pe-content" rows="9" style="min-height:170px">${esc(item.content)}</textarea></div><label class="inline-row" style="font-size:12px;margin-top:12px"><input id="pe-enabled" type="checkbox" ${item.enabled?'checked':''}> 启用此条目</label></form>`;modal(html,`${p?'<button class="btn danger" data-action="delete-preset" data-id="'+esc(p.id)+'">删除</button>':''}<button class="btn ghost" data-action="close-modal">取消</button><button class="btn primary" data-action="save-preset" data-id="${esc(item.id)}">保存条目</button>`)}
async function savePreset(id){try{await api('/preset',{id:id||undefined,mode:state.presetMode,name:$('pe-name').value,role:$('pe-role').value,content:$('pe-content').value,enabled:$('pe-enabled').checked});closeModal();await refreshPresets();toast('Prompt 已保存')}catch(e){toast(e.message)}}
async function togglePreset(id){const p=state.presets.find(x=>x.id===id);if(!p)return;await api('/preset', {...p,enabled:!p.enabled});await refreshPresets()}
async function movePreset(id,dir){const list=state.presets.filter(x=>x.mode===state.presetMode).sort((a,b)=>a.sort_order-b.sort_order),idx=list.findIndex(x=>x.id===id);if(idx<0||idx+dir<0||idx+dir>=list.length)return;[list[idx],list[idx+dir]]=[list[idx+dir],list[idx]];await api('/preset',{action:'order',ids:list.map(x=>x.id)});await refreshPresets()}
function modal(html,buttons){$('modal-root').innerHTML=`<div class="modal-overlay" id="modal-overlay"><div class="modal" role="dialog" aria-modal="true"><button class="icon-btn modal-close" data-action="close-modal">${I('x')}</button>${html}<div class="modal-actions">${buttons||`<button class="btn soft" data-action="close-modal">好的</button>`}</div></div></div>`}
function closeModal(){$('modal-root').innerHTML=''}
// Central action delegation
addEventListener('click',async e=>{
if(state.profileMenuOpen&&!e.target.closest('#topbar-profile-dropdown')){
  state.profileMenuOpen=false;
  $('topbar-profile-dropdown')?.classList.remove('is-open');
  document.querySelector('#topbar-profile-dropdown .profile-dropdown-menu')?.classList.remove('open');
  document.querySelector('#topbar-profile-dropdown .profile-dropdown-btn')?.setAttribute('aria-expanded','false');
}
const el=e.target.closest('[data-action]');if(!el)return;const a=el.dataset.action;try{
if(a==='toggle-profile-menu'){
  state.profileMenuOpen=!state.profileMenuOpen;
  $('topbar-profile-dropdown')?.classList.toggle('is-open',state.profileMenuOpen);
  const menu=document.querySelector('#topbar-profile-dropdown .profile-dropdown-menu');
  if(menu)menu.classList.toggle('open',state.profileMenuOpen);
  el.setAttribute('aria-expanded',state.profileMenuOpen?'true':'false');
  return;
}
if(a==='quick-switch-profile'){
  const nextId=el.dataset.id;
  state.profileMenuOpen=false;
  $('topbar-profile-dropdown')?.classList.remove('is-open');
  const menu=document.querySelector('#topbar-profile-dropdown .profile-dropdown-menu');
  if(menu)menu.classList.remove('open');
  if(!nextId||nextId===state.activeId)return;
  state.activeId=nextId;
  try{localStorage.setItem('parallel-active-profile',state.activeId)}catch{}
  state.profileDraft=null;
  state.threadId='';
  state.renderedThreadId='';
  state.candidates=[];
  state.allowAllSources=false;
  renderChrome();
  const curName=activeProfile()?.name||'';
  if(state.tab==='discover')await loadCandidates(false);
  else if(state.tab==='messages')await loadThreads();
  else if(state.tab==='profile')renderProfile(activeProfile());
  if(state.tab!=='messages')refreshInboxQuietly();
  toast(`已切换至账户「${curName}」`);
  return;
}
if(a==='toggle-chat-plus'){
  state.chatPlusOpen=!state.chatPlusOpen;
  el.classList.toggle('active',state.chatPlusOpen);
  el.classList.toggle('is-open',state.chatPlusOpen);
  el.setAttribute('aria-expanded',state.chatPlusOpen?'true':'false');
  const panel=$('chat-plus-panel');
  if(panel){
    panel.classList.toggle('open',state.chatPlusOpen);
    panel.classList.toggle('is-open',state.chatPlusOpen);
  }
  const body=$('chat-body');
  if(body)body.scrollTop=body.scrollHeight;
  return;
}
if(a==='chat-plus-item'){
  const label=el.dataset.label||'功能';
  toast(`「${label}」功能位置已就绪，接下来可以为你定制具体交互`);
  return;
}
if(a==='nav')return await navigate(el.dataset.tab);
if(a==='retry')return await navigate(state.tab);
if(a==='go-profile')return navigate('profile');
if(a==='go-discover')return navigate('discover');
if(a==='new-profile'){state.profileDraft=newDraft();return renderProfile(state.profileDraft)}
if(a==='switch-profile'){state.activeId=el.dataset.id;try{localStorage.setItem('parallel-active-profile',state.activeId)}catch{};state.profileDraft=null;state.threadId='';state.renderedThreadId='';state.candidates=[];state.allowAllSources=false;renderChrome();refreshInboxQuietly();return renderProfile(activeProfile())}
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
if(a==='choose-api-mode'){
  const useDemo=el.dataset.demo==='yes';
  try{sessionStorage.setItem('parallel-api-choice',useDemo?'demo':'normal')}catch{}
  const r=await api('/settings',{demo_enabled:useDemo});
  state.settings=r.settings;
  closeModal();
  renderChrome();
  if(state.tab==='terminal')renderTerminal();
  return toast(useDemo?'已进入演示模式':'已保持正常模式（未连接 API）');
}
if(a==='close-modal')return closeModal();
if(a==='open-match'){const id=el.dataset.id;closeModal();state.threadId=id;return navigate('messages')}
if(a==='select-thread')return loadThread(el.dataset.id);
if(a==='back-threads'){++threadRequestSeq;state.threadId='';state.renderedThreadId='';return renderMessages()}
if(a==='change-mode')return changeMode();
if(a==='toggle-hot-chat')return toggleHotChat();
if(a==='open-char-hub')return openCharacterHubModal(false);
if(a==='toggle-nickname-edit'){
  const ed=$('char-hub-nick-editor');
  if(ed){
    const nextShow=ed.style.display==='none';
    ed.style.display=nextShow?'grid':'none';
    if(nextShow){$('char-hub-nick-input')?.focus();$('char-hub-nick-input')?.select()}
  }else{
    openCharacterHubModal(true);
  }
  return;
}
if(a==='save-nickname')return saveCharacterNickname($('char-hub-nick-input')?.value||'');
if(a==='reset-nickname')return saveCharacterNickname('');
if(a==='cancel-nickname'){
  const ed=$('char-hub-nick-editor');
  if(ed)ed.style.display='none';
  return;
}
if(a==='open-date-picker'){
  if(e.target.tagName!=='INPUT'){
    const inp=el.querySelector('input[type="date"]');
    if(inp){
      inp.focus();
      try{if(typeof inp.showPicker==='function')inp.showPicker()}catch{}
    }
  }else{
    try{if(typeof e.target.showPicker==='function')e.target.showPicker()}catch{}
  }
  return;
}
if(a==='open-surveillance')return openSurveillanceModal(false,'');
if(a==='refresh-surveillance')return openSurveillanceModal(true,el.dataset.date||'');
if(a==='select-surv-date')return openSurveillanceModal(false,el.dataset.date||'');
if(a==='open-diary')return openDiaryModal('',false);
if(a==='refresh-diary')return openDiaryModal(el.dataset.date||'',true);
if(a==='select-diary-date')return openDiaryModal(el.dataset.date||'',false);
if(a==='surv-enter-meeting'){
  const loc=el.dataset.loc||'';
  if(loc)state.meetingLocation=loc;
  closeModal();
  return changeMode();
}
if(a==='open-meeting-record')return openMeetingRecordModal(el.dataset.id);
if(a==='open-daily-messages')return openDailyMessagesModal(el.dataset.id);
if(a==='open-memories')return openMemoriesModal('',state.memoryCategory||'all');
if(a==='filter-memories')return openMemoriesModal($('memory-search-input')?.value.trim()||'',el.dataset.cat||'all');
if(a==='search-memories')return openMemoriesModal($('memory-search-input')?.value.trim()||'',state.memoryCategory||'all');
if(a==='add-memory'){
  const val=$('memory-add-input')?.value.trim()||'';
  if(!val){toast('请先输入记忆内容');return}
  await api('/memory-action',{profileId:state.activeId,characterId:state.threadId,action:'add',summary:val});
  toast('已写入该角色的共同记忆档案');
  return openMemoriesModal($('memory-search-input')?.value.trim()||'',state.memoryCategory||'all');
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
  return openMemoriesModal($('memory-search-input')?.value.trim()||'',state.memoryCategory||'all');
}
if(a==='delete-memory'){
  await api('/memory-action',{profileId:state.activeId,characterId:state.threadId,action:'delete',memoryId:el.dataset.id});
  toast('记忆条目已删除');
  return openMemoriesModal($('memory-search-input')?.value.trim()||'',state.memoryCategory||'all');
}
if(a==='export-backup')return exportBackup();
if(a==='confirm-restore-backup')return confirmRestoreBackup();
if(a==='continue-reply')return continueReply();
if(a==='delete-message')return deleteMessage(el.dataset.id);
if(a==='unmatch')return confirmUnmatch();
if(a==='confirm-unmatch'){await api('/unmatch',{profileId:state.activeId,characterId:state.threadId});closeModal();state.threadId='';state.renderedThreadId='';await loadThreads();return toast('已解除匹配，记忆和聊天保留')}
if(a==='term-tab'){state.terminalTab=el.dataset.tab;if(state.terminalTab==='logs')refreshSystemLogs();return renderTerminal()}
if(a==='preset-mode'){state.presetMode=el.dataset.mode;return renderTerminal()}
if(a==='preset-disable-defaults'){await api('/preset',{action:'disable_defaults',mode:state.presetMode});await refreshPresets();return toast('已停用默认保底条目，仅保留自定义预设')}
if(a==='preset-deduplicate'){const r=await api('/preset',{action:'deduplicate',mode:state.presetMode});await refreshPresets();return toast(`已清理 ${r.removed||0} 条重复预设`)}
if(a==='toggle-system-logs'){await api('/system-logs-settings',{enabled:state.logEnabled===false});await refreshSystemLogs();return toast(state.logEnabled?'调试记录已开启':'调试记录已关闭')}
if(a==='refresh-system-logs'){await refreshSystemLogs();return toast('生成日志已刷新')}
if(a==='filter-system-logs'){state.logFilterMode=el.dataset.mode||'all';return renderTerminal()}
if(a==='clear-system-logs'){return modal('<h2>清空所有生成日志？</h2><p>这将清空本地保存的模型生成诊断日志（不影响聊天记录、记忆或预设）。</p>','<button class="btn ghost" data-action="close-modal">取消</button><button class="btn danger" data-action="confirm-clear-system-logs">确认清空</button>')}
if(a==='confirm-clear-system-logs'){await api('/system-logs-clear',{});state.systemLogs=[];closeModal();renderTerminal();return toast('生成日志已清空')}
if(a==='delete-system-log'){await api('/system-logs-clear',{id:el.dataset.id});await refreshSystemLogs();return toast('已删除该条日志')}
if(a==='copy-system-log'){const log=(state.systemLogs||[]).find(x=>x.id===el.dataset.id);if(!log)return;try{await navigator.clipboard.writeText(JSON.stringify(log,null,2));toast('诊断日志 JSON 已复制到剪贴板')}catch{downloadJson(log,'Parallel_Log_'+log.id+'.json');toast('已下载诊断日志 JSON')}return}
if(a==='clear-key'){return modal('<h2>清除 API Key？</h2><p>确定清除当前保存的 API Key 吗？</p>','<button class="btn ghost" data-action="close-modal">取消</button><button class="btn danger" data-action="confirm-clear-key">确认清除</button>')}
if(a==='confirm-clear-key'){const r=await api('/settings',{clear_key:true});state.settings=r.settings;closeModal();renderTerminal();return toast('密钥已清除')}
if(a==='clear-image-key'){return modal('<h2>清除图片 API Key？</h2><p>确定清除当前保存的图片生成 API Key 吗？清除后将恢复为文字呈现照片。</p>','<button class="btn ghost" data-action="close-modal">取消</button><button class="btn danger" data-action="confirm-clear-image-key">确认清除</button>')}
if(a==='confirm-clear-image-key'){const r=await api('/settings',{clear_image_key:true});state.settings=r.settings;closeModal();renderTerminal();return toast('图片密钥已清除，已恢复文字照片模式')}
if(a==='fetch-models')return fetchModels();
if(a==='fetch-image-models')return fetchImageModels();
if(a==='trigger-proactive-now')return checkProactiveMessages('manual',state.threadId||'');
if(a==='export-preset')return exportPreset(el.dataset.scope);
if(a==='apply-preset-import')return applyPresetImport(el.dataset.how);
if(a==='add-preset')return editPresetModal(null);
if(a==='edit-preset')return editPresetModal(state.presets.find(x=>x.id===el.dataset.id));
if(a==='toggle-preset')return togglePreset(el.dataset.id);
if(a==='move-preset')return movePreset(el.dataset.id,Number(el.dataset.dir));
if(a==='save-preset')return savePreset(el.dataset.id);
if(a==='delete-preset'){await api('/preset',{action:'delete',id:el.dataset.id});closeModal();toast('条目已删除');return refreshPresets()}
}catch(err){toast(err.message)}});
addEventListener('pointerdown',()=>{state.lastUserActiveAt=Date.now()},{passive:true});
addEventListener('change',e=>{
  if(e.target.id==='portable-restore')importBackup(e.target.files[0]);
  if(e.target.id==='preset-import-file')choosePresetImport(e.target.files[0]);
  if(e.target.id==='surv-date-input'&&e.target.value)openSurveillanceModal(false,e.target.value);
  if(e.target.id==='diary-date-input'&&e.target.value)openDiaryModal(e.target.value,false);
});
addEventListener('keydown',e=>{state.lastUserActiveAt=Date.now();if(e.target.id==='char-hub-nick-input'&&e.key==='Enter'){e.preventDefault();saveCharacterNickname(e.target.value);return}if(e.target.id==='pf-source-input'&&e.key==='Enter'){e.preventDefault();addSourceTag();return}if(e.target.id==='memory-search-input'&&e.key==='Enter'){e.preventDefault();openMemoriesModal(e.target.value.trim());return}if(e.target.id==='memory-add-input'&&e.key==='Enter'){e.preventDefault();document.querySelector('[data-action="add-memory"]')?.click();return}if(e.key==='Escape')closeModal();if(state.tab==='discover'&&e.target.tagName!=='INPUT'&&e.target.tagName!=='TEXTAREA'&&!$('modal-overlay')){if(e.key==='ArrowLeft')doSwipe('left');if(e.key==='ArrowRight')doSwipe('right')}});
// Fit the visible viewport while the iOS keyboard is open without disabling pinch zoom.
function syncVisibleViewport(){
  const vv=window.visualViewport;
  if(vv&&Math.abs(vv.scale-1)>0.01)return;
  const height=vv?.height||window.innerHeight;
  if(height>0)document.documentElement.style.setProperty('--parallel-visible-height',Math.round(height)+'px');
  document.documentElement.style.setProperty('--parallel-visible-top',Math.round(vv?.offsetTop||0)+'px');
}
window.addEventListener('resize',syncVisibleViewport,{passive:true});
window.visualViewport?.addEventListener('resize',syncVisibleViewport,{passive:true});
window.visualViewport?.addEventListener('scroll',syncVisibleViewport,{passive:true});
document.addEventListener('visibilitychange',()=>{
  if(!document.hidden&&state.activeId){
    if(state.tab==='messages')void loadThreads(state.threadId).catch(()=>{});
    else refreshInboxQuietly();
  }
});
syncVisibleViewport();
bootstrap();
