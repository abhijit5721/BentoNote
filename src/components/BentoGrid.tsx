import React from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

export const BentoGrid = ({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, staggerChildren: 0.1 }}
      className={cn(
        "grid md:auto-rows-[18rem] grid-cols-1 md:grid-cols-3 gap-4 max-w-7xl mx-auto ",
        className
      )}
    >
      {children}
    </motion.div>
  );
};

export const BentoGridItem = ({
  className,
  title,
  description,
  header,
  icon,
  children,
}: {
  className?: string;
  title?: string | React.ReactNode;
  description?: string | React.ReactNode;
  header?: React.ReactNode;
  icon?: React.ReactNode;
  children?: React.ReactNode;
}) => {
  return (
    <motion.div
      whileHover={{ y: -8 }}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
      className={cn(
        "row-span-1 rounded-[2rem] group/bento transition-all duration-500 p-4 md:p-8 glass flex flex-col justify-between relative overflow-hidden",
        className
      )}
    >
      {/* Subtle background glow on hover */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover/bento:opacity-100 transition-opacity duration-500" />
      
      <div className="relative z-10 h-full flex flex-col min-h-0">
        <div className="flex-1 min-h-0 flex flex-col">
          {header}
        </div>
        <div className="mt-6 group-hover/bento:translate-x-1 transition-transform duration-300 shrink-0">
          <div className="flex items-center gap-2 mb-2">
            {icon && <div className="p-2 rounded-lg bg-primary/10 text-primary">{icon}</div>}
            <div className="font-heading font-bold text-lg tracking-tight text-foreground">
              {title}
            </div>
          </div>
          <div className="font-sans font-medium text-muted-foreground text-xs leading-relaxed max-w-[90%]">
            {description}
          </div>
          {children}
        </div>
      </div>
    </motion.div>
  );
};
