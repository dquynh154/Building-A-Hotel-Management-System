'use client';

import * as React from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { cn } from '@/lib/utils'; // nếu bạn có helper này, nếu chưa có thì dùng className nối chuỗi bình thường

const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;
const PopoverAnchor = PopoverPrimitive.Anchor;

const PopoverContent = React.forwardRef<
    React.ElementRef<typeof PopoverPrimitive.Content>,
    React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> & { align?: 'start' | 'center' | 'end' }
>(({ className, align = 'center', sideOffset = 4, ...props }, ref) => (
    <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
            ref={ref}
            align={align}
            sideOffset={sideOffset}
            className={cn(
                'z-50 w-64 rounded-xl border border-slate-200 bg-white p-4 shadow-lg animate-in fade-in-0 zoom-in-95',
                'data-[state=open]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
                className
            )}
            {...props}
        />
    </PopoverPrimitive.Portal>
));

PopoverContent.displayName = PopoverPrimitive.Content.displayName;

export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor };
