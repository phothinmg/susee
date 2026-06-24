# frozen_string_literal: true

require "jekyll"

module MmDocsUrl
  # module MmDocsUrl::ContentsPath
  module ContentsPath
    CONTENTS_PREFIX = %r{\A/?contents/}

    def self.normalize(path)
      return path unless path.is_a?(String)

      normalized_path = path.sub(CONTENTS_PREFIX, "/")
      normalized_path.start_with?("/") ? normalized_path : "/#{normalized_path}"
    end
  end

  # module MmDocsUrl::ContentsUrlFilter
  module ContentsUrlFilter
    def contents_url(input)
      relative_url(MmDocsUrl::ContentsPath.normalize(input))
    end
  end

  # module MmDocsUrl::PagePublicPath
  module PagePublicPath
    def url
      page_url = super
      return MmDocsUrl::ContentsPath.normalize(page_url) if relative_path.start_with?("contents/")

      page_url
    end
  end
end

Liquid::Template.register_filter(MmDocsUrl::ContentsUrlFilter)
Jekyll::Page.prepend(MmDocsUrl::PagePublicPath)
