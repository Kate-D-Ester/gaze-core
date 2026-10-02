import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cn } from "@workspace/ui/lib/utils"
import { buttonVariants } from "./button-variants"
import type { ButtonProps } from "./button.types"
function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonProps) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}
export { Button }
