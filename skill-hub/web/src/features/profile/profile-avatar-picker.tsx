import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Check } from 'lucide-react'
import { profileApi } from '@/api/client'
import { avatarAssetUrl } from '@/shared/lib/avatar-asset-url'
import { Button } from '@/shared/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/shared/ui/dialog'

const avatarGroups = {
  animals: ['fox', 'rabbit', 'cat', 'bear', 'panda', 'owl', 'koi', 'deer', 'bee', 'turtle', 'octopus', 'hedgehog'],
  plants: ['fern', 'ginkgo', 'cactus', 'bamboo', 'lotus', 'mushroom', 'sprout', 'sunflower'],
} as const
type AvatarId = (typeof avatarGroups)[keyof typeof avatarGroups][number]

export function ProfileAvatarPicker({ avatarUrl, name }: { avatarUrl: string | null; name: string }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<AvatarId>()
  const current = Object.values(avatarGroups).flat().find(id => avatarUrl === `/avatars/${id}.svg`)
  const save = useMutation({
    mutationFn: (avatarId: AvatarId) => profileApi.updateProfile({ avatarId }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['profile'] }),
        queryClient.invalidateQueries({ queryKey: ['auth', 'me'] }),
      ])
      setOpen(false)
    },
  })

  function setPickerOpen(value: boolean) {
    if (save.isPending) return
    if (value) {
      save.reset()
      setSelected(current)
    }
    setOpen(value)
  }

  return (
    <Dialog open={open} onOpenChange={setPickerOpen}>
      <div className="flex items-center gap-4 border-b border-border pb-5">
        {avatarUrl ? (
          <img src={avatarAssetUrl(avatarUrl)} alt="" className="h-16 w-16 shrink-0 rounded-2xl border border-border object-cover" />
        ) : (
          <span aria-hidden="true" className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-muted text-xl font-semibold">
            {name.charAt(0) || '?'}
          </span>
        )}
        <div className="space-y-2">
          <p className="text-sm font-medium">{t('profile.avatar.title')}</p>
          <DialogTrigger asChild>
            <Button type="button" variant="outline" size="sm">{t('profile.avatar.choose')}</Button>
          </DialogTrigger>
        </div>
      </div>
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('profile.avatar.choose')}</DialogTitle>
          <DialogDescription>{t('profile.avatar.description')}</DialogDescription>
        </DialogHeader>
        <fieldset className="min-w-0 space-y-4" disabled={save.isPending}>
          <legend className="sr-only">{t('profile.avatar.title')}</legend>
          {Object.entries(avatarGroups).map(([group, ids]) => (
            <div key={group} className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">{t(`profile.avatar.${group}`)}</p>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                {ids.map(id => (
                  <label key={id} className="relative cursor-pointer rounded-lg">
                    <input type="radio" name="profile-avatar" value={id} checked={selected === id}
                      onChange={() => { save.reset(); setSelected(id) }} className="peer sr-only" />
                    <span className="flex flex-col items-center gap-1 rounded-lg border border-transparent p-1 text-center text-[11px] leading-4 peer-checked:border-primary peer-checked:bg-accent peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring hover:bg-muted">
                      <img src={avatarAssetUrl(`/avatars/${id}.svg`)} alt="" width="48" height="48" className="h-12 w-12 rounded-xl" />
                      <span className="break-words">{t(`profile.avatar.names.${id}`)}</span>
                    </span>
                    {selected === id ? <Check aria-hidden="true" className="absolute right-1 top-1 h-3.5 w-3.5 rounded-full bg-primary text-primary-foreground" /> : null}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </fieldset>
        {save.isError ? <p role="alert" className="text-sm text-destructive">{t('profile.avatar.error')}</p> : null}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={save.isPending} onClick={() => setOpen(false)}>{t('profile.cancel')}</Button>
          <Button type="button" disabled={!selected || current === selected || save.isPending} onClick={() => { if (selected) save.mutate(selected) }}>
            {t(save.isPending ? 'profile.saving' : 'profile.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
