# frozen_string_literal: true

require "jekyll"

module MmDocs
  # module MmDocs::AssetPath
  module AssetPath
    PUBLIC_PREFIX = %r{\A/?public/}

    def self.normalize(path)
      return path unless path.is_a?(String)

      normalized_path = path.sub(PUBLIC_PREFIX, "/")
      normalized_path.start_with?("/") ? normalized_path : "/#{normalized_path}"
    end
  end

  # module MmDocs::ContentsPath
  module ContentsPath
    CONTENTS_PREFIX = %r{\A/?contents/}

    def self.normalize(path)
      return path unless path.is_a?(String)

      normalized_path = path.sub(CONTENTS_PREFIX, "/")
      normalized_path.start_with?("/") ? normalized_path : "/#{normalized_path}"
    end
  end

  # module MmDocs::AssetUrlFilter
  module AssetUrlFilter
    def asset_url(input)
      relative_url(MmDocs::AssetPath.normalize(input))
    end
  end

  # module MmDocs::ContentsUrlFilter
  module ContentsUrlFilter
    def contents_url(input)
      relative_url(MmDocs::ContentsPath.normalize(input))
    end
  end

  # module MmDocs::StaticFilePublicPath
  module StaticFilePublicPath
    def url
      MmDocs::AssetPath.normalize(super)
    end
  end

  # module MmDocs::PagePublicPath
  module PagePublicPath
    def url
      page_url = super
      return MmDocs::AssetPath.normalize(page_url) if relative_path.start_with?("public/")
      return MmDocs::ContentsPath.normalize(page_url) if relative_path.start_with?("contents/")

      page_url
    end
  end
end

Liquid::Template.register_filter(MmDocs::AssetUrlFilter)
Liquid::Template.register_filter(MmDocs::ContentsUrlFilter)
Jekyll::StaticFile.prepend(MmDocs::StaticFilePublicPath)
Jekyll::Page.prepend(MmDocs::PagePublicPath)
